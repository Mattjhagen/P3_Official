/**
 * ProfileService - Handles user profile operations via local auth server API
 * Replaces direct Supabase calls with proper REST API calls
 */

import type { UserProfile } from '../types';
import { frontendEnv } from './env';

const API_BASE_URL = frontendEnv.VITE_BACKEND_URL || 'http://localhost:5001';

/**
 * Get authentication token from localStorage
 */
const getAuthToken = (): string | null => {
  return localStorage.getItem('p3_auth_token');
};

/**
 * Map UserProfile to database profile format
 */
const mapProfileToDbFormat = (profile: UserProfile) => {
  return {
    username: profile.name,
    display_name: profile.name,
    profile_picture_url: profile.avatarUrl,
    employment_title: profile.employmentStatus,
    annual_income: profile.income,
    financial_bio: profile.financialHistory,
    reputation_score: profile.reputationScore,
    balance: profile.balance,
    kyc_tier: profile.kycTier,
    kyc_status: profile.kycStatus,
    // Portal PIN settings
    portal_pin: profile.portalPinLock?.pinHash,
    portal_pin_enabled: profile.portalPinLock?.enabled || false,
  };
};

/**
 * Map database profile format to UserProfile
 */
const mapDbFormatToProfile = (dbProfile: any): Partial<UserProfile> => {
  return {
    id: dbProfile.id,
    name: dbProfile.display_name || dbProfile.username,
    avatarUrl: dbProfile.profile_picture_url,
    employmentStatus: dbProfile.employment_title,
    income: parseFloat(dbProfile.annual_income) || 0,
    financialHistory: dbProfile.financial_bio,
    reputationScore: dbProfile.reputation_score || 50,
    balance: parseFloat(dbProfile.balance) || 0,
    kycTier: dbProfile.kyc_tier,
    kycStatus: dbProfile.kyc_status,
    badges: dbProfile.badges || [],
    portalPinLock: {
      enabled: dbProfile.portal_pin_enabled || false,
      pinHash: dbProfile.portal_pin,
      inactivityMinutes: 15,
      pinLength: 0,
      updatedAt: dbProfile.updated_at,
    },
  };
};

export const ProfileService = {
  /**
   * Save/update user profile
   */
  async saveProfile(profile: UserProfile): Promise<void> {
    const token = getAuthToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const dbProfile = mapProfileToDbFormat(profile);

    const response = await fetch(`${API_BASE_URL}/api/profile/${profile.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(dbProfile),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to update profile' }));
      throw new Error(error.error || 'Failed to update profile');
    }

    console.log('[ProfileService] Profile saved successfully:', profile.id);
  },

  /**
   * Load user profile by ID
   */
  async loadProfile(userId: string): Promise<Partial<UserProfile> | null> {
    const token = getAuthToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}/api/profile/${userId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      const error = await response.json().catch(() => ({ error: 'Failed to load profile' }));
      throw new Error(error.error || 'Failed to load profile');
    }

    const data = await response.json();
    return mapDbFormatToProfile(data.profile);
  },

  /**
   * Change user password
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const token = getAuthToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    if (newPassword.length < 8) {
      throw new Error('New password must be at least 8 characters');
    }

    const response = await fetch(`${API_BASE_URL}/api/auth/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to change password' }));
      throw new Error(error.error || 'Failed to change password');
    }

    console.log('[ProfileService] Password changed successfully');
  },

  /**
   * Change user email
   */
  async changeEmail(newEmail: string, password: string): Promise<void> {
    const token = getAuthToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    if (!newEmail || !newEmail.includes('@')) {
      throw new Error('Invalid email address');
    }

    const response = await fetch(`${API_BASE_URL}/api/auth/change-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        new_email: newEmail.toLowerCase().trim(),
        password: password,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to change email' }));
      throw new Error(error.error || 'Failed to change email');
    }

    console.log('[ProfileService] Email change initiated. Check your new email for confirmation.');
  },
};
