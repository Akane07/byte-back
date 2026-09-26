import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { JwtPayload } from './jwt.strategy';

/**
 * Пропускает и гостя, и вошедшего. С валидным токеном в request.user
 * будет пользователь, без токена (или с протухшим) — ничего.
 * Для страниц, которые гость может смотреть: лента, заказ.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = JwtPayload>(_error: unknown, user: TUser | false) {
    return (user || undefined) as TUser;
  }
}
