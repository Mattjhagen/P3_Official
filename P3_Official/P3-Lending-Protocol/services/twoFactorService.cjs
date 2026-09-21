#!/usr/bin/env node
/**
 * Two-Factor Authentication Service
 * TOTP-based 2FA using speakeasy
 */

const speakeasy = require('speakeasy');
const QRCode = require('qrcode');

class TwoFactorService {
  /**
   * Generate a new 2FA secret for a user
   */
  generateSecret(email) {
    const secret = speakeasy.generateSecret({
      name: `P3 Lending (${email})`,
      issuer: 'P3 Lending',
      length: 32
    });

    return {
      secret: secret.base32, // Store this encrypted in database
      otpauth_url: secret.otpauth_url // Use this to generate QR code
    };
  }

  /**
   * Generate QR code data URL for secret
   */
  async generateQRCode(otpauth_url) {
    try {
      const qrCodeDataURL = await QRCode.toDataURL(otpauth_url);
      return qrCodeDataURL;
    } catch (error) {
      console.error('QR code generation error:', error);
      return null;
    }
  }

  /**
   * Verify a TOTP token
   */
  verifyToken(secret, token) {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2 // Allow 2 time steps before/after for clock drift
    });
  }

  /**
   * Check if 2FA is required for this user
   * Required when:
   * - Balance > 0
   * - Has portfolio holdings
   * - Trying to withdraw
   */
  async is2FARequired(pool, userId) {
    try {
      const result = await pool.query(
        `SELECT
          balance,
          portfolio,
          two_factor_enabled
        FROM public.profiles
        WHERE id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return { required: false, reason: null };
      }

      const profile = result.rows[0];

      // If already enabled, always required
      if (profile.two_factor_enabled) {
        return { required: true, reason: '2FA is enabled' };
      }

      // Check if balance > 0
      if (profile.balance && parseFloat(profile.balance) > 0) {
        return { required: true, reason: 'Account has balance' };
      }

      // Check if has portfolio
      const portfolio = profile.portfolio || [];
      if (Array.isArray(portfolio) && portfolio.length > 0) {
        const hasHoldings = portfolio.some(item =>
          item.amount && parseFloat(item.amount) > 0
        );
        if (hasHoldings) {
          return { required: true, reason: 'Account has holdings' };
        }
      }

      return { required: false, reason: null };
    } catch (error) {
      console.error('Error checking 2FA requirement:', error);
      return { required: false, reason: null };
    }
  }

  /**
   * Get backup codes for 2FA
   * Generate 10 random backup codes
   */
  generateBackupCodes(count = 10) {
    const codes = [];
    for (let i = 0; i < count; i++) {
      // Generate 8-digit backup code
      const code = Math.floor(10000000 + Math.random() * 90000000).toString();
      codes.push(code);
    }
    return codes;
  }
}

module.exports = new TwoFactorService();
