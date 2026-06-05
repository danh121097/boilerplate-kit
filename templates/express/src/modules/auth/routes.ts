import {
  loginSchema,
  registerSchema,
  validate
} from './validation';
import { authenticate } from '@/middleware/auth';
import {
  authRateLimiter,
  loginRateLimiter
} from '@/middleware/rate-limit';
import type { RouteGroup } from '@/types/routing';
import * as AuthController from './controller';

const authGroup: RouteGroup = {
  prefix: '/auth',
  routes: [
    {
      method: 'post',
      path: '/register',
      bodySchema: registerSchema,
      middleware: [authRateLimiter, validate(registerSchema)],
      handler: AuthController.register
    },
    {
      method: 'post',
      path: '/login',
      bodySchema: loginSchema,
      middleware: [loginRateLimiter, validate(loginSchema)],
      handler: AuthController.login
    },
    // Refresh token is read from httpOnly cookie — no body validation needed
    {
      method: 'post',
      path: '/refresh',
      middleware: [authRateLimiter],
      handler: AuthController.refresh
    },
    // Refresh token is read from httpOnly cookie — no body validation needed
    {
      method: 'post',
      path: '/logout',
      middleware: [authRateLimiter],
      handler: AuthController.logout
    },
    {
      method: 'get',
      path: '/me',
      middleware: [authenticate],
      handler: AuthController.getMe
    }
  ]
};

export default authGroup;
