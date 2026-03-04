import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class JmapService {
  private readonly stalwartUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.stalwartUrl =
      this.configService.get<string>('stalwart.url') ?? 'http://localhost:8085';
  }

  async request(method: string, params: Record<string, unknown>) {
    const response = await firstValueFrom(
      this.httpService.post(`${this.stalwartUrl}/jmap`, {
        using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail'],
        methodCalls: [[method, params, '0']],
      }),
    );
    return response.data as unknown;
  }
}
