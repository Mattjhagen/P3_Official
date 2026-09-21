/**
 * OAuth Service for Google and Apple Sign-In
 * Integrates with local authentication backend
 */

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';

export type OAuthProvider = 'google' | 'apple';

interface OAuthConfig {
  google: {
    clientId: string;
    redirectUri: string;
    scope: string;
  };
  apple: {
    clientId: string;
    redirectUri: string;
    scope: string;
  };
}

class OAuthService {
  private config: OAuthConfig = {
    google: {
      clientId: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
      redirectUri: `${window.location.origin}/auth/callback`,
      scope: 'openid email profile'
    },
    apple: {
      clientId: import.meta.env.VITE_APPLE_CLIENT_ID || '',
      redirectUri: `${window.location.origin}/auth/callback`,
      scope: 'email name'
    }
  };

  /**
   * Initiate OAuth flow with Google
   */
  async signInWithGoogle(): Promise<void> {
    const { clientId, redirectUri, scope } = this.config.google;

    if (!clientId) {
      throw new Error('Google Client ID not configured');
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: scope,
      access_type: 'offline',
      prompt: 'consent',
      state: this.generateState('google')
    });

    window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Initiate OAuth flow with Apple
   */
  async signInWithApple(): Promise<void> {
    const { clientId, redirectUri, scope } = this.config.apple;

    if (!clientId) {
      throw new Error('Apple Client ID not configured');
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      response_mode: 'form_post',
      scope: scope,
      state: this.generateState('apple')
    });

    window.location.href = `https://appleid.apple.com/auth/authorize?${params.toString()}`;
  }

  /**
   * Handle OAuth callback
   */
  async handleCallback(code: string, state: string): Promise<any> {
    try {
      // Verify state
      const storedState = sessionStorage.getItem('oauth_state');
      if (state !== storedState) {
        throw new Error('Invalid state parameter');
      }

      // Exchange code for token via backend
      const response = await fetch(`${API_BASE}/api/auth/oauth/callback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, state })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'OAuth authentication failed');
      }

      const data = await response.json();

      // Store token and user data
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));

      // Clean up
      sessionStorage.removeItem('oauth_state');

      return data;
    } catch (error) {
      console.error('OAuth callback error:', error);
      throw error;
    }
  }

  /**
   * Generate and store state parameter for CSRF protection
   */
  private generateState(provider: OAuthProvider): string {
    const state = `${provider}_${Math.random().toString(36).substring(2)}_${Date.now()}`;
    sessionStorage.setItem('oauth_state', state);
    return state;
  }

  /**
   * Check if OAuth is configured for a provider
   */
  isConfigured(provider: OAuthProvider): boolean {
    return !!this.config[provider].clientId;
  }
}

// Export singleton instance
export const oauthService = new OAuthService();
