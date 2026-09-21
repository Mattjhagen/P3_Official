/**
 * Authentication Integration Service
 * Provides a unified interface for local authentication
 * Compatible with existing Supabase-style auth patterns
 */

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5001';

export interface AuthUser {
  id: string;
  email: string;
  user_metadata?: {
    full_name?: string;
    avatar_url?: string;
  };
  app_metadata?: any;
  created_at?: string;
}

export interface AuthSession {
  access_token: string;
  user: AuthUser;
}

export interface AuthResponse {
  data: {
    user: AuthUser | null;
    session: AuthSession | null;
  };
  error: {
    message: string;
  } | null;
}

class AuthIntegrationService {
  /**
   * Sign up a new user
   */
  async signUp(email: string, password: string, metadata?: any): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          full_name: metadata?.full_name || ''
        })
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          data: { user: null, session: null },
          error: { message: data.error || 'Registration failed' }
        };
      }

      // Store token
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));

      return {
        data: {
          user: data.user,
          session: {
            access_token: data.token,
            user: data.user
          }
        },
        error: null
      };
    } catch (error: any) {
      return {
        data: { user: null, session: null },
        error: { message: error.message || 'Network error' }
      };
    }
  }

  /**
   * Sign in with email and password
   */
  async signInWithPassword({ email, password }: { email: string; password: string }): Promise<AuthResponse> {
    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          data: { user: null, session: null },
          error: { message: data.error || 'Login failed' }
        };
      }

      // Store token
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('auth_user', JSON.stringify(data.user));

      return {
        data: {
          user: data.user,
          session: {
            access_token: data.token,
            user: data.user
          }
        },
        error: null
      };
    } catch (error: any) {
      return {
        data: { user: null, session: null },
        error: { message: error.message || 'Network error' }
      };
    }
  }

  /**
   * Sign out
   */
  async signOut(): Promise<{ error: null }> {
    localStorage.removeItem('auth_token');
    localStorage.removeItem('auth_user');
    return { error: null };
  }

  /**
   * Get current session
   */
  async getSession(): Promise<{ data: { session: AuthSession | null }; error: null }> {
    const token = localStorage.getItem('auth_token');
    const userStr = localStorage.getItem('auth_user');

    if (token && userStr) {
      try {
        const user = JSON.parse(userStr);
        return {
          data: {
            session: {
              access_token: token,
              user
            }
          },
          error: null
        };
      } catch (e) {
        return { data: { session: null }, error: null };
      }
    }

    return { data: { session: null }, error: null };
  }

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChange(callback: (event: string, session: AuthSession | null) => void) {
    // Check current session
    this.getSession().then(({ data }) => {
      if (data.session) {
        callback('SIGNED_IN', data.session);
      }
    });

    // Return unsubscribe function
    return {
      data: {
        subscription: {
          unsubscribe: () => {}
        }
      }
    };
  }

  /**
   * Get auth token for API requests
   */
  getToken(): string | null {
    return localStorage.getItem('auth_token');
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated(): boolean {
    return !!localStorage.getItem('auth_token');
  }
}

// Export singleton instance
export const authIntegration = new AuthIntegrationService();

// Create a Supabase-compatible auth client
export const createLocalAuthCompatibleClient = () => {
  return {
    auth: {
      signUp: authIntegration.signUp.bind(authIntegration),
      signInWithPassword: authIntegration.signInWithPassword.bind(authIntegration),
      signOut: authIntegration.signOut.bind(authIntegration),
      getSession: authIntegration.getSession.bind(authIntegration),
      onAuthStateChange: authIntegration.onAuthStateChange.bind(authIntegration),
    },
    // Database operations - stub for local development
    from: (table: string) => {
      console.log(`[Local Mode] Database operation on table: ${table} - using local storage`);
      return {
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: null, error: null }),
            maybeSingle: () => Promise.resolve({ data: null, error: null }),
          }),
          order: () => ({
            limit: () => Promise.resolve({ data: [], error: null }),
          }),
        }),
        insert: () => Promise.resolve({ data: null, error: null }),
        update: () => ({
          eq: () => Promise.resolve({ data: null, error: null }),
        }),
        delete: () => ({
          eq: () => Promise.resolve({ data: null, error: null }),
        }),
        upsert: () => Promise.resolve({ data: null, error: null }),
      };
    },
    // Storage operations - stub
    storage: {
      from: (bucket: string) => ({
        upload: () => Promise.resolve({ data: null, error: null }),
        download: () => Promise.resolve({ data: null, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      }),
    },
    // Realtime channels - stub
    channel: (name: string) => ({
      on: (event: string, filter: any, callback: any) => ({ subscribe: () => {} }),
      subscribe: () => {},
      unsubscribe: () => Promise.resolve({ error: null }),
    }),
    // Remove channel - stub
    removeChannel: (channel: any) => Promise.resolve({ error: null }),
  };
};
