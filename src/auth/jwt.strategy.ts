import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: 'stepa_and_dima_and_ilya_ETONASHPROJECTSUKA', // Секрет для проверки токена
    });
  }

  async validate(payload: { userId: string }) {
    return { userId: payload.userId };
  }
}
