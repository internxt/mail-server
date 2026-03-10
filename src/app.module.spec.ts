import { Test } from '@nestjs/testing';
import { describe, it, expect } from 'vitest';
import { AppModule } from './app.module';

describe('AppModule', () => {
  it('should compile the module', async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(module).toBeDefined();
  });
});
