import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { dbAll, dbGet, dbRun } from '../db/database';
import { authMiddleware, generateToken, logAudit, requireRoles, AuthenticatedUser, blacklistToken } from '../middleware/auth';
import { sendOtpEmail } from '../lib/smtp';

export const authRouter = Router();

// Simple in-memory rate limiter
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(key: string, maxAttempts: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  entry.count++;
  return entry.count <= maxAttempts;
}
// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(key);
  }
}, 5 * 60 * 1000);

function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

// Generate a deterministic token ID for blacklisting
function generateTokenId(userId: string): string {
  return `token-${userId}-${Date.now()}`;
}

// Login - Step 1: Validate credentials, send OTP
authRouter.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    // Rate limit: 5 attempts per 15 minutes per username
    if (!checkRateLimit(`login:${username}`, 5, 15 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many login attempts. Please try again in 15 minutes.' });
    }

    const user = await dbGet<any>(
      `SELECT u.*, r.name as role_name, r.display_name as role_display_name 
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE (u.username = ? OR u.email = ?) AND u.is_active = 1`,
      [username, username]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Generate and store OTP
    const otpCode = generateOtp();
    const otpId = `otp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await dbRun(
      'INSERT INTO otp_tokens (id, user_id, email, otp_code, purpose, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [otpId, user.id, user.email, otpCode, 'login', expiresAt]
    );

    // Send OTP via email (non-blocking — login succeeds even if email fails)
    let emailSent = false;
    try { emailSent = await sendOtpEmail(user.email, otpCode, 'login'); } catch (e:any){ console.error('OTP email failed:', e.message); }

    // Mask email for display
    const maskedEmail = user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');

    return res.json({
      requiresOtp: true,
      userId: user.id,
      username: user.username,
      email: maskedEmail,
      fullName: user.full_name,
      role: user.role_name,
      roleDisplayName: user.role_display_name,
      emailSent,
    });
  } catch (err:any) {
    console.error('Login error:', err);
    return res.status(500).json({ error: err.message || 'Login failed due to server error' });
  }
});

// Login - Step 2: Verify OTP and return token
authRouter.post('/verify-otp', async (req: Request, res: Response) => {
  try {
    const { userId, otpCode, purpose } = req.body;
    if (!userId || !otpCode) {
      return res.status(400).json({ error: 'User ID and OTP code are required' });
    }

    // Rate limit: 5 OTP attempts per 10 minutes per user
    if (!checkRateLimit(`otp:${userId}`, 5, 10 * 60 * 1000)) {
      return res.status(429).json({ error: 'Too many OTP attempts. Please request a new code.' });
    }

    const otpPurpose = purpose || 'login';

    const otpRecord = await dbGet<any>(
      'SELECT * FROM otp_tokens WHERE user_id = ? AND otp_code = ? AND purpose = ? AND used = 0 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [userId, otpCode, otpPurpose]
    );

    if (!otpRecord) {
      return res.status(401).json({ error: 'Invalid or expired verification code' });
    }

    // Mark OTP as used
    await dbRun('UPDATE otp_tokens SET used = 1 WHERE id = ?', [otpRecord.id]);

    const user = await dbGet<any>(
      `SELECT u.*, r.name as role_name, r.display_name as role_display_name 
       FROM users u 
       JOIN roles r ON u.role_id = r.id 
       WHERE u.id = ? AND u.is_active = 1`,
      [userId]
    );

    if (!user) {
      return res.status(401).json({ error: 'User not found or deactivated' });
    }

    const authUser: AuthenticatedUser = {
      id: user.id,
      username: user.username,
      full_name: user.full_name,
      role: user.role_name,
      role_id: user.role_id,
    };

    const token = generateToken(authUser);
    await logAudit(authUser, 'Auth', 'OTP Verified', user.id, `OTP verified for ${otpPurpose}`, req.ip);

    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        role: user.role_name,
        role_display_name: user.role_display_name,
        avatar_url: user.avatar_url,
      },
    });
  } catch (err:any) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ error: err.message || 'OTP verification failed' });
  }
});

// Resend OTP
authRouter.post('/resend-otp', async (req: Request, res: Response) => {
  try {
    const { userId, purpose } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'User ID is required' });
    }

    const user = await dbGet<any>('SELECT * FROM users WHERE id = ? AND is_active = 1', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Invalidate old OTPs
    await dbRun(
      'UPDATE otp_tokens SET used = 1 WHERE user_id = ? AND purpose = ? AND used = 0',
      [userId, purpose || 'login']
    );

    // Generate new OTP
    const otpCode = generateOtp();
    const otpId = `otp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await dbRun(
      'INSERT INTO otp_tokens (id, user_id, email, otp_code, purpose, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [otpId, user.id, user.email, otpCode, purpose || 'login', expiresAt]
    );

    let emailSent = false;
    try { emailSent = await sendOtpEmail(user.email, otpCode, purpose || 'login'); } catch(e:any){ console.error('Resend OTP email failed:', e.message); }

    return res.json({ message: 'Verification code resent', emailSent });
  } catch (err:any) {
    console.error('Resend OTP error:', err);
    return res.status(500).json({ error: err.message || 'Failed to resend code' });
  }
});

// Forgot Password - Send OTP to email
authRouter.post('/forgot-password', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await dbGet<any>('SELECT * FROM users WHERE email = ? AND is_active = 1', [email]);
    if (!user) {
      // Don't reveal if email exists
      return res.json({ message: 'If an account exists with that email, a reset code has been sent.' });
    }

    // Invalidate old reset OTPs
    await dbRun(
      'UPDATE otp_tokens SET used = 1 WHERE user_id = ? AND purpose = ? AND used = 0',
      [user.id, 'password_reset']
    );

    const otpCode = generateOtp();
    const otpId = `otp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    await dbRun(
      'INSERT INTO otp_tokens (id, user_id, email, otp_code, purpose, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [otpId, user.id, user.email, otpCode, 'password_reset', expiresAt]
    );

    let emailSent = false;
    try { emailSent = await sendOtpEmail(user.email, otpCode, 'password_reset'); } catch(e:any){ console.error('Forgot PW email failed:', e.message); }

    const maskedEmail = user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
    return res.json({
      message: 'If an account exists with that email, a reset code has been sent.',
      userId: user.id,
      email: maskedEmail,
      emailSent,
    });
  } catch (err:any) {
    console.error('Forgot password error:', err);
    return res.status(500).json({ error: err.message || 'Failed to send reset code' });
  }
});

// Reset Password - Verify OTP + set new password
authRouter.post('/reset-password', async (req: Request, res: Response) => {
  try {
    const { userId, otpCode, newPassword } = req.body;
    if (!userId || !otpCode || !newPassword) {
      return res.status(400).json({ error: 'User ID, OTP code, and new password are required' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    if (!/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      return res.status(400).json({ error: 'Password must contain uppercase, lowercase, and numbers' });
    }

    const otpRecord = await dbGet<any>(
      'SELECT * FROM otp_tokens WHERE user_id = ? AND otp_code = ? AND purpose = ? AND used = 0 AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
      [userId, otpCode, 'password_reset']
    );

    if (!otpRecord) {
      return res.status(401).json({ error: 'Invalid or expired reset code' });
    }

    // Mark OTP as used
    await dbRun('UPDATE otp_tokens SET used = 1 WHERE id = ?', [otpRecord.id]);

    // Invalidate all existing tokens for this user on password change
    await dbRun(
      'INSERT INTO token_blacklist (token_id, user_id, blacklisted_at, expires_at, reason) VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 24 HOUR), "Password Reset")',
      [generateTokenId(userId), userId]
    );
    await dbRun(
      'DELETE FROM token_blacklist WHERE user_id = ? AND reason = "Logout" AND expires_at < DATE_SUB(NOW(), INTERVAL 1 HOUR)' // cleanup old logouts
    );

    // Update password
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(newPassword, salt);
    await dbRun('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [hash, userId]);

    return res.json({ message: 'Password reset successfully. You can now log in with your new password.' });
  } catch (err:any) {
    console.error('Reset password error:', err);
    return res.status(500).json({ error: err.message || 'Failed to reset password' });
  }
});

// Get current profile
authRouter.get('/me', authMiddleware, async (req: Request, res: Response) => {
  const user = await dbGet<any>(
    `SELECT u.id, u.username, u.email, u.full_name, u.phone, u.avatar_url, r.name as role, r.display_name as role_display_name 
     FROM users u 
     JOIN roles r ON u.role_id = r.id 
     WHERE u.id = ?`,
    [req.user!.id]
  );

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  return res.json({ user });
});

// POST /api/auth/logout - Invalidate current token
authRouter.post('/logout', authMiddleware, async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    const userId = req.user?.id;
    await blacklistToken(token, userId ?? '', new Date(Date.now() + 24 * 60 * 60 * 1000), 'Logout');
    await logAudit(req.user, 'Auth', 'Logout', req.user!.id, `User ${req.user!.username} logged out`);
  }
  return res.json({ message: 'Logged out successfully' });
});

// User management (Admin only)
authRouter.get('/users', authMiddleware, requireRoles(['admin']), async (req: Request, res: Response) => {
  const users = await dbAll<any>(
    `SELECT u.id, u.username, u.email, u.full_name, u.phone, u.is_active, u.created_at, r.id as role_id, r.name as role, r.display_name as role_display_name 
     FROM users u 
     JOIN roles r ON u.role_id = r.id 
     ORDER BY u.created_at DESC`
  );
  const roles = await dbAll<any>('SELECT * FROM roles ORDER BY display_name');
  return res.json({ users, roles });
});

authRouter.post('/users', authMiddleware, requireRoles(['admin']), async (req: Request, res: Response) => {
  const { username, email, password, full_name, phone, role_id, role } = req.body;
  let roleId = role_id;
  if (!roleId && role) {
    const roleRow = await dbGet<any>('SELECT id FROM roles WHERE name = ?', [role]);
    roleId = roleRow ? roleRow.id : null;
  }
  if (!username || !email || !password || !full_name || !roleId) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const existing = await dbGet<any>('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
  if (existing) {
    return res.status(400).json({ error: 'Username or email already in use' });
  }

  const id = `usr-${Date.now()}`;
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);

  await dbRun(
    'INSERT INTO users (id, username, email, password_hash, full_name, phone, role_id, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
    [id, username, email, hash, full_name, phone || null, roleId]
  );

  await logAudit(req.user, 'Users', 'Created', id, `Created new user ${username} (${full_name})`);
  return res.status(201).json({ message: 'User created successfully', id });
});

authRouter.put('/users/:id', authMiddleware, requireRoles(['admin']), async (req: Request, res: Response) => {
  const { username, email, full_name, phone, role_id, role, is_active, password } = req.body;
  const user = await dbGet<any>('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (username && username !== user.username) {
    const nameTaken = await dbGet<any>('SELECT id FROM users WHERE username = ? AND id != ?', [username, req.params.id]);
    if (nameTaken) {
      return res.status(400).json({ error: 'Username already in use' });
    }
  }
  if (email && email !== user.email) {
    const mailTaken = await dbGet<any>('SELECT id FROM users WHERE email = ? AND id != ?', [email, req.params.id]);
    if (mailTaken) {
      return res.status(400).json({ error: 'Email already in use' });
    }
  }

  let roleId = role_id;
  if (!roleId && role) {
    const roleRow = await dbGet<any>('SELECT id FROM roles WHERE name = ?', [role]);
    roleId = roleRow ? roleRow.id : user.role_id;
  }
  roleId = roleId || user.role_id;

  const newUsername = username || user.username;
  const newEmail = email !== undefined ? email : user.email;
  const newFullName = full_name !== undefined ? full_name : user.full_name;
  const newPhone = phone !== undefined ? phone : user.phone;
  const newActive = is_active !== undefined ? (is_active ? 1 : 0) : user.is_active;

  if (password && password.trim().length > 0) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    await dbRun(
      'UPDATE users SET username = ?, email = ?, full_name = ?, phone = ?, role_id = ?, is_active = ?, password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newUsername, newEmail, newFullName, newPhone, roleId, newActive, hash, req.params.id]
    );
  } else {
    await dbRun(
      'UPDATE users SET username = ?, email = ?, full_name = ?, phone = ?, role_id = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newUsername, newEmail, newFullName, newPhone, roleId, newActive, req.params.id]
    );
  }

  await logAudit(req.user, 'Users', 'Updated', req.params.id, `Updated user ${newUsername}`);
  return res.json({ message: 'User updated successfully' });
});

// DELETE /api/auth/users/:id - Admin drops (soft-deactivates) a user account
authRouter.delete('/users/:id', authMiddleware, requireRoles(['admin']), async (req: Request, res: Response) => {
  const user = await dbGet<any>('SELECT * FROM users WHERE id = ?', [req.params.id]);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (user.id === req.user?.id) {
    return res.status(400).json({ error: 'You cannot deactivate your own account.' });
  }

  await dbRun('UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id]);
  await logAudit(req.user, 'Users', 'Dropped', req.params.id, `Dropped user account ${user.username} (${user.full_name})`);
  return res.json({ message: `User account ${user.username} deactivated successfully` });
});
