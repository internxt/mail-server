import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

const STRATEGY_ID = 'gateway.jwt.rs256';

@Injectable()
export class GatewayJwtStrategy extends PassportStrategy(
  Strategy,
  STRATEGY_ID,
) {
  static readonly id = STRATEGY_ID;

  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: Buffer.from(
        configService.getOrThrow<string>('secrets.gateway'),
        'base64',
      ).toString('utf8'),
      algorithms: ['RS256'],
    });
  }

  validate(): boolean {
    return true;
  }
}
