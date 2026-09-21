"""
P3 Lending Homelab Health Check Lambda
Monitors homelab health and triggers failover when needed
"""

import json
import os
import boto3
import urllib3
from datetime import datetime
from typing import Dict, Any

# AWS clients
dynamodb = boto3.resource('dynamodb')
stepfunctions = boto3.client('stepfunctions')
ssm = boto3.client('ssm')
cloudwatch = boto3.client('cloudwatch')

# Configuration
STATE_TABLE = os.environ['STATE_TABLE_NAME']
FAILOVER_STATE_MACHINE_ARN = os.environ['FAILOVER_STATE_MACHINE_ARN']
CONSECUTIVE_FAILURES_THRESHOLD = int(os.environ.get('CONSECUTIVE_FAILURES_THRESHOLD', '3'))
CONSECUTIVE_SUCCESSES_THRESHOLD = int(os.environ.get('CONSECUTIVE_SUCCESSES_THRESHOLD', '5'))
HEALTH_CHECK_TIMEOUT = int(os.environ.get('HEALTH_CHECK_TIMEOUT', '30'))

# HTTP client
http = urllib3.PoolManager(timeout=urllib3.Timeout(connect=10.0, read=HEALTH_CHECK_TIMEOUT))

def get_homelab_endpoint() -> str:
    """Get homelab endpoint from SSM Parameter Store"""
    try:
        response = ssm.get_parameter(Name='/p3/homelab/endpoint', WithDecryption=True)
        return response['Parameter']['Value']
    except Exception as e:
        print(f"Failed to get homelab endpoint from SSM: {e}")
        return os.environ.get('HOMELAB_ENDPOINT', 'https://p3lending.space')

def get_failover_mode() -> str:
    """Get failover mode (auto, homelab, aws)"""
    try:
        response = ssm.get_parameter(Name='/p3/failover/mode')
        return response['Parameter']['Value']
    except:
        return 'auto'  # Default to automatic mode

def check_homelab_health(endpoint: str) -> Dict[str, Any]:
    """
    Check homelab health endpoint
    Returns: {healthy: bool, response_time_ms: int, status_code: int, error: str}
    """
    health_url = f"{endpoint}/health"
    start_time = datetime.now()

    try:
        response = http.request('GET', health_url)
        response_time_ms = int((datetime.now() - start_time).total_seconds() * 1000)

        # Check if response is healthy
        is_healthy = (
            response.status == 200 and
            response_time_ms < 5000  # Response must be under 5 seconds
        )

        return {
            'healthy': is_healthy,
            'response_time_ms': response_time_ms,
            'status_code': response.status,
            'error': None
        }

    except Exception as e:
        response_time_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        return {
            'healthy': False,
            'response_time_ms': response_time_ms,
            'status_code': 0,
            'error': str(e)
        }

def get_current_state() -> Dict[str, Any]:
    """Get current failover state from DynamoDB"""
    table = dynamodb.Table(STATE_TABLE)
    try:
        response = table.get_item(Key={'id': 'current'})
        if 'Item' in response:
            return response['Item']
    except Exception as e:
        print(f"Error getting state from DynamoDB: {e}")

    # Default state
    return {
        'id': 'current',
        'mode': 'homelab',  # Current active mode: homelab or aws
        'consecutive_failures': 0,
        'consecutive_successes': 0,
        'last_check_time': None,
        'last_failover_time': None,
        'last_failback_time': None,
        'failover_count': 0
    }

def update_state(state: Dict[str, Any]):
    """Update failover state in DynamoDB"""
    table = dynamodb.Table(STATE_TABLE)
    table.put_item(Item=state)

def publish_metric(metric_name: str, value: float, unit: str = 'None'):
    """Publish custom CloudWatch metric"""
    try:
        cloudwatch.put_metric_data(
            Namespace='P3Lending/Failover',
            MetricData=[
                {
                    'MetricName': metric_name,
                    'Value': value,
                    'Unit': unit,
                    'Timestamp': datetime.now()
                }
            ]
        )
    except Exception as e:
        print(f"Failed to publish metric {metric_name}: {e}")

def trigger_failover():
    """Trigger Step Functions failover workflow"""
    try:
        response = stepfunctions.start_execution(
            stateMachineArn=FAILOVER_STATE_MACHINE_ARN,
            input=json.dumps({
                'action': 'failover_to_aws',
                'trigger': 'automatic',
                'timestamp': datetime.now().isoformat()
            })
        )
        print(f"Started failover execution: {response['executionArn']}")
        return True
    except stepfunctions.exceptions.ExecutionAlreadyExists:
        print("Failover execution already in progress")
        return True
    except Exception as e:
        print(f"Failed to trigger failover: {e}")
        return False

def trigger_failback():
    """Trigger Step Functions failback workflow"""
    try:
        response = stepfunctions.start_execution(
            stateMachineArn=FAILOVER_STATE_MACHINE_ARN,
            input=json.dumps({
                'action': 'failback_to_homelab',
                'trigger': 'automatic',
                'timestamp': datetime.now().isoformat()
            })
        )
        print(f"Started failback execution: {response['executionArn']}")
        return True
    except stepfunctions.exceptions.ExecutionAlreadyExists:
        print("Failback execution already in progress")
        return True
    except Exception as e:
        print(f"Failed to trigger failback: {e}")
        return False

def lambda_handler(event, context):
    """Main Lambda handler"""

    # Get configuration
    homelab_endpoint = get_homelab_endpoint()
    failover_mode = get_failover_mode()

    print(f"Health check starting - Endpoint: {homelab_endpoint}, Mode: {failover_mode}")

    # Check homelab health
    health_result = check_homelab_health(homelab_endpoint)

    # Publish metrics
    publish_metric('HomelabHealthy', 1 if health_result['healthy'] else 0)
    publish_metric('HomelabResponseTime', health_result['response_time_ms'], 'Milliseconds')
    if health_result['status_code'] > 0:
        publish_metric('HomelabStatusCode', health_result['status_code'], 'Count')

    # Get current state
    state = get_current_state()
    current_mode = state['mode']

    # Update state
    state['last_check_time'] = datetime.now().isoformat()

    # Manual mode overrides
    if failover_mode == 'aws':
        print("Manual override: Force AWS mode")
        if current_mode != 'aws':
            trigger_failover()
            state['mode'] = 'aws'
        update_state(state)
        return {'statusCode': 200, 'body': 'Manual AWS mode active'}

    if failover_mode == 'homelab':
        print("Manual override: Force homelab mode")
        if current_mode != 'homelab':
            trigger_failback()
            state['mode'] = 'homelab'
        update_state(state)
        return {'statusCode': 200, 'body': 'Manual homelab mode active'}

    # Automatic mode logic
    if health_result['healthy']:
        print("✅ Homelab is healthy")
        state['consecutive_failures'] = 0
        state['consecutive_successes'] = state.get('consecutive_successes', 0) + 1

        # If in AWS mode and homelab has been stable, failback
        if current_mode == 'aws' and state['consecutive_successes'] >= CONSECUTIVE_SUCCESSES_THRESHOLD:
            print(f"🔄 Homelab stable for {state['consecutive_successes']} checks, initiating failback")
            if trigger_failback():
                state['mode'] = 'homelab'
                state['consecutive_successes'] = 0
                state['last_failback_time'] = datetime.now().isoformat()
                publish_metric('FailbackCount', 1, 'Count')

    else:
        print(f"❌ Homelab is unhealthy: {health_result['error']}")
        state['consecutive_successes'] = 0
        state['consecutive_failures'] = state.get('consecutive_failures', 0) + 1

        # If in homelab mode and failures exceed threshold, failover
        if current_mode == 'homelab' and state['consecutive_failures'] >= CONSECUTIVE_FAILURES_THRESHOLD:
            print(f"🚨 Homelab failed {state['consecutive_failures']} consecutive checks, initiating failover")
            if trigger_failover():
                state['mode'] = 'aws'
                state['consecutive_failures'] = 0
                state['failover_count'] = state.get('failover_count', 0) + 1
                state['last_failover_time'] = datetime.now().isoformat()
                publish_metric('FailoverCount', 1, 'Count')

    # Save updated state
    update_state(state)

    # Publish mode metric
    publish_metric('CurrentMode', 1 if state['mode'] == 'aws' else 0)

    return {
        'statusCode': 200,
        'body': json.dumps({
            'homelab_healthy': health_result['healthy'],
            'current_mode': state['mode'],
            'consecutive_failures': state['consecutive_failures'],
            'consecutive_successes': state['consecutive_successes']
        })
    }
