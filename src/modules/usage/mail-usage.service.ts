import { Injectable, Logger } from '@nestjs/common';
import { BridgeClient } from '../infrastructure/bridge/bridge.service.js';
import {
  DuplicateEntryKeyError,
  MailBucketEntryRepository,
} from './repositories/mail-bucket-entry.repository.js';

export interface TrackStoredMessageParams {
  mailAccountId: string;
  userUuid: string;
  bucketId: string;
  entryKey: string;
  size: number;
}

export interface ReleaseStoredMessageParams {
  userUuid: string;
  bucketId: string;
  entryKey: string;
}

@Injectable()
export class MailUsageService {
  private readonly logger = new Logger(MailUsageService.name);

  constructor(
    private readonly entries: MailBucketEntryRepository,
    private readonly bridge: BridgeClient,
  ) {}

  async trackStoredMessage(params: TrackStoredMessageParams): Promise<void> {
    const { mailAccountId, userUuid, bucketId, entryKey, size } = params;

    const existing = await this.entries.findByEntryKey(entryKey);
    if (existing) {
      this.logger.debug({ entryKey }, 'Message already tracked; skipping');
      return;
    }

    const { id: bridgeEntryId, totalUsedSpaceBytes } =
      await this.bridge.createBucketEntry(userUuid, bucketId, size);

    try {
      await this.entries.create({
        mailAccountId,
        entryKey,
        bridgeEntryId,
        size,
      });
    } catch (error) {
      if (error instanceof DuplicateEntryKeyError) {
        this.logger.debug(
          { entryKey, bridgeEntryId },
          'Concurrent tracking detected; rolling back minted bucket entry',
        );
        await this.bridge.deleteBucketEntry(userUuid, bucketId, bridgeEntryId);
        return;
      }
      throw error;
    }

    this.logger.log(
      { entryKey, bridgeEntryId, size, totalUsedSpaceBytes },
      'Tracked stored message',
    );
  }

  async releaseStoredMessage(
    params: ReleaseStoredMessageParams,
  ): Promise<void> {
    const { userUuid, bucketId, entryKey } = params;

    const existing = await this.entries.findByEntryKey(entryKey);
    if (!existing) {
      this.logger.debug(
        { entryKey },
        'No tracked entry for message; skipping release',
      );
      return;
    }

    await this.bridge.deleteBucketEntry(
      userUuid,
      bucketId,
      existing.bridgeEntryId,
    );
    await this.entries.deleteByEntryKey(entryKey);

    this.logger.log(
      { entryKey, bridgeEntryId: existing.bridgeEntryId },
      'Released stored message',
    );
  }
}
