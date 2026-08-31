import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { dbGet, dbRun, dbAll } from '../db/database';

// JWT Secret: must be set in .env for persistent tokens across restarts
function getJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  // Generate a cryptographically secure random secret and log it for reference
  const secret = crypto.randomBytes(64).toString('hex');
  console.warn('[SECURITY] JWT_SECRET not set in .env — generated random secret. Tokens will not survive server restart.');
  console.warn('[SECURITY] To persist tokens, add JWT_SECRET=<your-secret> to your .env file');
  process.env.JWT_SECRET = secret;
  return secret;
}

const JWT_SECRET = getJwtSecret();

// Check if token is blacklisted in DB
export async function isTokenBlacklisted(token: string): Promise<boolean> {
  try {
    const row = await dbGet<{ expires_at: string; user_id: string; reason: string }>(
      'SELECT expires_at, user_id, reason FROM token_blacklist WHERE token_id = ?',
      [token]
    );
    if (!row) return false;
    // Token is blacklisted if it hasn't expired yet
    return new Date(row.expires_at) > new Date();
  } catch (e) {
    console.error('Failed to check token blacklist:', e);
    return false;
  }
}

// Blacklist a token in DB (with expiry) - stores the actual JWT token
export async function blacklistToken(token: string, userId: string, expiresAt: Date, reason: string = 'Logout') {
  try {
    await dbRun(
      'INSERT INTO token_blacklist (token_id, user_id, blacklisted_at, expires_at, reason) VALUES (?, ?, NOW(), ?, ?)',
      [token, userId, expiresAt, reason]
    );
    // Also clean up old expired entries (keep table tidy)
    await dbRun(
      'DELETE FROM token_blacklist WHERE expires_at < NOW()'
    );
  } catch (e) {
    console.error('Failed to blacklist token:', e);
  }
}

export interface AuthenticatedUser {
  id: string;
  username: string;
  full_name: string;
  role: 'admin' | 'manager' | 'chef' | 'housekeeper' | 'bartender';
  role_id: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export function generateToken(user: AuthenticatedUser): string {
  return jwt.sign(
    { id: user.id, username: user.username, full_name: user.full_name, role: user.role, role_id: user.role_id },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
}

export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Await the blacklist check properly
    const isBlacklisted = await isTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({ error: 'Session has been revoked. Please log in again.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
  }
}

export function requireRoles(allowedRoles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }

    if (req.user.role === 'admin' || allowedRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({
      error: `Access denied. Your role (${req.user.role}) does not have permission to perform this action.`
    });
  };
}

export async function logAudit(
  user: AuthenticatedUser | { id: string; username: string; role: string } | undefined,
  module: string,
  action: string,
  recordId: string | null,
  details: string,
  ipAddress?: string
) {
  try {
    const id = `aud-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const uid = user ? user.id : 'system';
    const uname = user ? user.username : 'system';
    const role = user ? user.role : 'system';

    await dbRun(
      'INSERT INTO audit_logs (id, user_id, username, role, module, action, record_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, uid, uname, role, module, action, recordId, details, ipAddress || '127.0.0.1']
    );
  } catch (e) {
    console.error('Failed to log audit event:', e);
  }
}

export async function createNotification(
  type: string,
  title: string,
  message: string,
  targetRole: string = 'all',
  targetUserId: string | null = null,
  link: string | null = null
) {
  try {
    const id = `notif-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    await dbRun(
      'INSERT INTO notifications (id, type, title, message, target_role, target_user_id, link) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, type, title, message, targetRole, targetUserId, link]
    );
  } catch (e) {
    console.error('Failed to create notification:', e);
  }
}
