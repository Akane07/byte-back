import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from './jwt.strategy';

/** id пользователя из проверенного JWT. Использовать вместе с JwtAuthGuard. */
export const UserId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user.userId;
  },
);
