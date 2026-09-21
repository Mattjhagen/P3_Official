/**
 * Local Authentication Service
 * Replaces Supabase auth with local API calls
 */

import { frontendEnv } from './env';

const API_BASE = frontendEnv.VITE_BACKEND_URL || 'http://localhost:5001';

export interface LocalUser {
  id: string;
  email: string;
  email_confirmed_at?: string;
  user_metadata?: any;
  created_at?: string;
}

export interface AuthResponse {
  user: LocalUser | null;
  token?: string;
  error?: string;
  message?: string;
}

class LocalAuthService {
  private token: string | null = null;
  private user: LocalUser | null = null;

  constructor() {
    // Load from localStorage on init
    this.token = localStorage.getItem('auth_token');
    const userData = localStorage.getItem('auth_user');
    if (userData) {
      try {
        this.user = JSON.parse(userData);
      } catch (e) {
        console.error('Failed to parse stored user data', e);
      }
    }
  }

  /**
   * Register a new user
   */
  async signUp(email: string, password: string, metadata?: any): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          full_name: metadata?.full_name || '',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { user: null, error: data.error || 'Registration failed' };
      }

      // Store token and user
      this.token = data.token;
      this.user = data.user;

      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));

      return { user: data.user, token: data.token, message: data.message };
    } catch (error: any) {
      console.error('Sign up error:', error);
      return { user: null, error: error.message || 'Network error' };
    }
  }

  /**
   * Sign in with email and password
   */
  async signIn(email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { user: null, error: data.error || 'Login failed' };
      }

      // Store token and user
      this.token = data.token;
      this.user = data.user;

      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));

      return { user: data.user, token: data.token };
    } catch (error: any) {
      console.error('Sign in error:', error);
      return { user: null, error: error.message || 'Network error' };
    }
  }

  /**
   * Sign out
   */
  async signOut(): Promise<void> {
    this.token = null;
    this.user = null;
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
  }

  /**
   * Get current user
   */
  getUser(): LocalUser | null {
    return this.user;
  }

  /**
   * Get current session
   */
  getSession(): { user: LocalUser | null; token: string | null } {
    return {
      user: this.user,
      token: this.token,
    };
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!this.token && !!this.user;
  }

  /**
   * Get auth token for API requests
   */
  getToken(): string | null {
    return this.token;
  }

  /**
   * Confirm email with token
   */
  async confirmEmail(token: string): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/confirm-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();

      if (!response.ok) {
        return { user: null, error: data.error || 'Confirmation failed' };
      }

      return { user: data.user, message: data.message };
    } catch (error: any) {
      console.error('Confirm email error:', error);
      return { user: null, error: error.message || 'Network error' };
    }
  }

  /**
   * Fetch current user from API (refresh user data)
   */
  async fetchUser(): Promise<AuthResponse> {
    if (!this.token) {
      return { user: null, error: 'No token available' };
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/user`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
        },
      });

      const data = await response.json();

      if (!response.ok) {
        // Token might be invalid, clear it
        if (response.status === 401 || response.status === 403) {
          await this.signOut();
        }
        return { user: null, error: data.error || 'Failed to fetch user' };
      }

      this.user = data.user;
      localStorage.setItem('auth_user', JSON.stringify(data.user));

      return { user: data.user };
    } catch (error: any) {
      console.error('Fetch user error:', error);
      return { user: null, error: error.message || 'Network error' };
    }
  }
}

// Export singleton instance
export const localAuth = new LocalAuthService();

// Also create a Supabase-compatible wrapper for easier migration
export const createLocalAuthClient = () => {
  return {
    auth: {
      signUp: async ({ email, password, options }: any) => {
        return localAuth.signUp(email, password, options?.data);
      },
      signInWithPassword: async ({ email, password }: any) => {
        return localAuth.signIn(email, password);
      },
      signOut: async () => {
        return localAuth.signOut();
      },
      getUser: async () => {
        const user = localAuth.getUser();
        return { data: { user }, error: null };
      },
      getSession: async () => {
        const session = localAuth.getSession();
        return {
          data: {
            session: session.token ? {
              access_token: session.token,
              user: session.user
            } : null
          },
          error: null
        };
      },
      onAuthStateChange: (callback: any) => {
        // Simple implementation - just call callback with current state
        const session = localAuth.getSession();
        if (session.token && session.user) {
          callback('SIGNED_IN', { user: session.user });
        }
        // Return unsubscribe function
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
    },
  };
};
