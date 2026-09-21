#!/usr/bin/env node
/**
 * P3 Lending Protocol - Local Authentication Server
 * Simple Express server for user registration and login
 * Works with local PostgreSQL database
 */

const express = require('express');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-in-production';

// PostgreSQL connection
const pool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DB || 'p3lending',
  user: process.env.POSTGRES_USER || 'p3user',
  password: process.env.POSTGRES_PASSWORD || 'p3password',
});

// Email transporter (Mailhog for local development)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: process.env.SMTP_PORT || 1025,
  secure: false,
  ignoreTLS: true,
});

// Middleware
app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Database health check
app.get('/api/db-status', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      status: 'connected',
      database: 'p3lending',
      timestamp: result.rows[0].now
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Register new user
app.post('/api/auth/register', async (req, res) => {
  const { email, password, full_name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM auth.users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate confirmation token
    const confirmationToken = crypto.randomBytes(32).toString('hex');

    // Check if user is admin (p3lending.space domain)
    const isAdmin = email.toLowerCase().endsWith('@p3lending.space');
    const userRole = isAdmin ? 'admin' : 'authenticated';

    // Insert user
    const result = await pool.query(
      `INSERT INTO auth.users (
        email,
        encrypted_password,
        confirmation_token,
        confirmation_sent_at,
        raw_user_meta_data,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, NOW(), $4, NOW(), NOW()) RETURNING id, email`,
      [
        email.toLowerCase(),
        hashedPassword,
        confirmationToken,
        JSON.stringify({ full_name: full_name || '', role: userRole })
      ]
    );

    const user = result.rows[0];

    // Send confirmation email
    const baseUrl = process.env.FRONTEND_URL || 'https://p3lending.space';
    const mailhogUrl = process.env.MAILHOG_URL || 'https://mail.p3lending.space';

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@p3lending.local',
        to: email,
        subject: 'Welcome to P3 Lending - Confirm Your Email',
        html: `
          <h1>Welcome to P3 Lending!</h1>
          <p>Thank you for registering. Please confirm your email by clicking the link below:</p>
          <p><a href="${baseUrl}/confirm-email?token=${confirmationToken}">Confirm Email</a></p>
          <p>Or use this token: ${confirmationToken}</p>
          <p><small>View this email in Mailhog (development): <a href="${mailhogUrl}">${mailhogUrl}</a></small></p>
        `
      });
      console.log(`📧 Confirmation email sent to ${email}`);
    } catch (emailError) {
      console.error('Email error:', emailError.message);
    }

    // Generate JWT token
    const token = jwt.sign(
      { sub: user.id, email: user.email, role: userRole },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        role: userRole,
      },
      token,
      message: 'Registration successful. Please check your email (Mailhog) for confirmation.'
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed', details: error.message });
  }
});

// Login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Find user
    const result = await pool.query(
      'SELECT id, email, encrypted_password, email_confirmed_at, raw_user_meta_data FROM auth.users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const isValid = await bcrypt.compare(password, user.encrypted_password);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Update last sign in
    await pool.query(
      'UPDATE auth.users SET last_sign_in_at = NOW() WHERE id = $1',
      [user.id]
    );

    // Check if user is admin (p3lending.space domain)
    const isAdmin = user.email.toLowerCase().endsWith('@p3lending.space');
    const userRole = isAdmin ? 'admin' : 'authenticated';

    // Generate JWT token
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: userRole,
        user_metadata: user.raw_user_meta_data
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        email_confirmed_at: user.email_confirmed_at,
        role: userRole,
        user_metadata: user.raw_user_meta_data
      },
      token,
      message: 'Login successful'
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

// Confirm email
app.post('/api/auth/confirm-email', async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    const result = await pool.query(
      `UPDATE auth.users
       SET email_confirmed_at = NOW(),
           confirmed_at = NOW(),
           confirmation_token = NULL
       WHERE confirmation_token = $1
       RETURNING id, email`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    res.json({
      message: 'Email confirmed successfully',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Confirmation error:', error);
    res.status(500).json({ error: 'Confirmation failed', details: error.message });
  }
});

// Get current user
app.get('/api/auth/user', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, email_confirmed_at, raw_user_meta_data, created_at FROM auth.users WHERE id = $1',
      [req.user.sub]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to get user', details: error.message });
  }
});

// Middleware to authenticate JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

// List all users (for debugging)
app.get('/api/debug/users', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, email_confirmed_at, created_at FROM auth.users ORDER BY created_at DESC LIMIT 100'
    );
    res.json({ users: result.rows });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('');
  console.log('🚀 P3 Lending Local Auth Server');
  console.log('================================');
  console.log(`✅ Server running on: http://localhost:${PORT}`);
  console.log(`✅ Database: postgresql://localhost:5432/p3lending`);
  console.log(`✅ Mailhog UI: http://localhost:8025`);
  console.log('');
  console.log('API Endpoints:');
  console.log(`  POST   http://localhost:${PORT}/api/auth/register`);
  console.log(`  POST   http://localhost:${PORT}/api/auth/login`);
  console.log(`  POST   http://localhost:${PORT}/api/auth/confirm-email`);
  console.log(`  GET    http://localhost:${PORT}/api/auth/user`);
  console.log(`  GET    http://localhost:${PORT}/api/debug/users`);
  console.log('');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down gracefully...');
  await pool.end();
  process.exit(0);
});

// Get user profile
app.get('/api/profile/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const result = await pool.query(
      'SELECT * FROM public.profiles WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({ profile: result.rows[0] });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

// Update user profile
app.put('/api/profile/:userId', async (req, res) => {
  const { userId } = req.params;
  const {
    username,
    display_name,
    profile_picture_url,
    employment_title,
    annual_income,
    financial_bio,
    portal_pin,
    portal_pin_enabled
  } = req.body;

  try {
    const result = await pool.query(
      `UPDATE public.profiles 
       SET username = COALESCE($1, username),
           display_name = COALESCE($2, display_name),
           profile_picture_url = COALESCE($3, profile_picture_url),
           employment_title = COALESCE($4, employment_title),
           annual_income = COALESCE($5, annual_income),
           financial_bio = COALESCE($6, financial_bio),
           portal_pin = COALESCE($7, portal_pin),
           portal_pin_enabled = COALESCE($8, portal_pin_enabled),
           last_active_at = NOW()
       WHERE id = $9
       RETURNING *`,
      [username, display_name, profile_picture_url, employment_title, annual_income, financial_bio, portal_pin, portal_pin_enabled, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    res.json({ profile: result.rows[0], message: 'Profile updated successfully' });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});


// Change password
app.post('/api/auth/change-password', authenticateToken, async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  if (new_password.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  try {
    // Get user's current password
    const userResult = await pool.query(
      'SELECT encrypted_password FROM auth.users WHERE id = $1',
      [req.user.sub]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValid = await bcrypt.compare(current_password, userResult.rows[0].encrypted_password);
    if (!isValid) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(new_password, 10);

    // Update password
    await pool.query(
      'UPDATE auth.users SET encrypted_password = $1, updated_at = NOW() WHERE id = $2',
      [hashedPassword, req.user.sub]
    );

    res.json({ message: 'Password changed successfully' });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

// Change email
app.post('/api/auth/change-email', authenticateToken, async (req, res) => {
  const { new_email, password } = req.body;

  if (!new_email || !password) {
    return res.status(400).json({ error: 'New email and password are required' });
  }

  const normalizedEmail = new_email.toLowerCase().trim();

  // Basic email validation
  if (!normalizedEmail.includes('@')) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    // Get user's current password and email
    const userResult = await pool.query(
      'SELECT encrypted_password, email FROM auth.users WHERE id = $1',
      [req.user.sub]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const currentEmail = userResult.rows[0].email;

    // Check if new email is same as current
    if (normalizedEmail === currentEmail) {
      return res.status(400).json({ error: 'New email is the same as current email' });
    }

    // Verify password
    const isValid = await bcrypt.compare(password, userResult.rows[0].encrypted_password);
    if (!isValid) {
      return res.status(401).json({ error: 'Password is incorrect' });
    }

    // Check if email is already in use
    const existingUser = await pool.query(
      'SELECT id FROM auth.users WHERE email = $1 AND id != $2',
      [normalizedEmail, req.user.sub]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'Email is already in use' });
    }

    // Generate confirmation token
    const confirmationToken = crypto.randomBytes(32).toString('hex');
    const confirmationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update user email (mark as unconfirmed)
    await pool.query(
      `UPDATE auth.users
       SET email = $1,
           email_confirmed_at = NULL,
           confirmation_token = $2,
           confirmation_sent_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [normalizedEmail, confirmationToken, req.user.sub]
    );

    // Send confirmation email to new address
    const confirmationUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/auth/confirm?token=${confirmationToken}`;

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@p3lending.local',
        to: normalizedEmail,
        subject: 'Confirm your new email address - P3 Lending',
        html: `
          <h2>Confirm Your Email Change</h2>
          <p>You requested to change your email address on P3 Lending.</p>
          <p>Your new email address is: <strong>${normalizedEmail}</strong></p>
          <p>Please click the link below to confirm this change:</p>
          <p><a href="${confirmationUrl}">${confirmationUrl}</a></p>
          <p>This link will expire in 24 hours.</p>
          <p>If you didn't request this change, please contact support immediately.</p>
        `
      });
    } catch (emailError) {
      console.error('Failed to send confirmation email:', emailError);
      // Don't fail the request if email fails in development
    }

    res.json({
      message: 'Email updated. Please check your new email address to confirm the change.',
      new_email: normalizedEmail
    });

  } catch (error) {
    console.error('Change email error:', error);
    res.status(500).json({ error: 'Failed to change email' });
  }
});


const twoFactorService = require('./services/twoFactorService.cjs');

// Enable 2FA - Step 1: Generate secret and QR code
app.post('/api/auth/2fa/enable', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.sub;
    const email = req.user.email;

    // Generate secret
    const { secret, otpauth_url } = twoFactorService.generateSecret(email);
    
    // Generate QR code
    const qrCode = await twoFactorService.generateQRCode(otpauth_url);

    // Store secret (temporarily, will be confirmed after verification)
    await pool.query(
      'UPDATE public.profiles SET two_factor_secret = $1 WHERE id = $2',
      [secret, userId]
    );

    res.json({
      secret, // Show to user as backup
      qrCode, // Display QR code for scanning
      message: 'Scan QR code with your authenticator app'
    });

  } catch (error) {
    console.error('2FA enable error:', error);
    res.status(500).json({ error: 'Failed to enable 2FA' });
  }
});

// Enable 2FA - Step 2: Verify and activate
app.post('/api/auth/2fa/verify', authenticateToken, async (req, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Token is required' });
  }

  try {
    const userId = req.user.sub;

    // Get secret
    const result = await pool.query(
      'SELECT two_factor_secret FROM public.profiles WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0 || !result.rows[0].two_factor_secret) {
      return res.status(400).json({ error: '2FA setup not started' });
    }

    const secret = result.rows[0].two_factor_secret;

    // Verify token
    const isValid = twoFactorService.verifyToken(secret, token);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid 2FA code' });
    }

    // Activate 2FA
    const backupCodes = twoFactorService.generateBackupCodes();
    
    await pool.query(
      `UPDATE public.profiles 
       SET two_factor_enabled = TRUE,
           raw_user_meta_data = jsonb_set(
             COALESCE(raw_user_meta_data, '{}'::jsonb),
             '{backup_codes}',
             $1::jsonb
           )
       WHERE id = $2`,
      [JSON.stringify(backupCodes), userId]
    );

    res.json({
      message: '2FA enabled successfully',
      backupCodes // Show these ONCE, user should save them
    });

  } catch (error) {
    console.error('2FA verify error:', error);
    res.status(500).json({ error: 'Failed to verify 2FA' });
  }
});

// Disable 2FA
app.post('/api/auth/2fa/disable', authenticateToken, async (req, res) => {
  const { password, token } = req.body;

  if (!password || !token) {
    return res.status(400).json({ error: 'Password and 2FA token required' });
  }

  try {
    const userId = req.user.sub;

    // Verify password
    const userResult = await pool.query(
      'SELECT encrypted_password FROM auth.users WHERE id = $1',
      [userId]
    );

    const isValidPassword = await bcrypt.compare(password, userResult.rows[0].encrypted_password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Get 2FA secret
    const profileResult = await pool.query(
      'SELECT two_factor_secret FROM public.profiles WHERE id = $1',
      [userId]
    );

    const secret = profileResult.rows[0].two_factor_secret;

    // Verify 2FA token
    const isValid = twoFactorService.verifyToken(secret, token);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid 2FA code' });
    }

    // Disable 2FA
    await pool.query(
      `UPDATE public.profiles 
       SET two_factor_enabled = FALSE,
           two_factor_secret = NULL
       WHERE id = $1`,
      [userId]
    );

    res.json({ message: '2FA disabled successfully' });

  } catch (error) {
    console.error('2FA disable error:', error);
    res.status(500).json({ error: 'Failed to disable 2FA' });
  }
});

// Check if 2FA is required
app.get('/api/auth/2fa/required/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { required, reason } = await twoFactorService.is2FARequired(pool, userId);
    
    res.json({ 
      required,
      reason,
      message: required 
        ? `2FA is required: ${reason}`
        : '2FA is optional for your account'
    });

  } catch (error) {
    console.error('2FA required check error:', error);
    res.status(500).json({ error: 'Failed to check 2FA requirement' });
  }
});

