import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { GatewayJwtStrategy } from './gateway-jwt.strategy.js';

@Injectable()
export class GatewayAuthGuard extends AuthGuard(GatewayJwtStrategy.id) {}
