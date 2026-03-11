import { describe, it, expect } from 'vitest';
import {
  mapJmapRoleToMailboxType,
  mapMailboxTypeToJmapRole,
  mapJmapMailbox,
  mapJmapEmailToSummary,
  mapJmapEmailToDetail,
  mapSendDtoToJmapCreate,
  mapDraftDtoToJmapCreate,
} from './jmap-mail.mapper.js';
import type { MailboxRole } from './jmap.types.js';
import type { DraftEmailDto, MailboxType } from '../../email/email.types.js';
import {
  newJmapMailbox,
  newJmapEmail,
  newJmapEmailAddress,
  newSendEmailDto,
  newDraftEmailDto,
  newEmailAddress,
} from '../../../../test/fixtures.js';

describe('jmap-mail.mapper', () => {
  describe('mapJmapRoleToMailboxType', () => {
    const directMappings: [MailboxRole, MailboxType][] = [
      ['inbox', 'inbox'],
      ['drafts', 'drafts'],
      ['sent', 'sent'],
      ['trash', 'trash'],
      ['archive', 'archive'],
    ];

    it.each(directMappings)(
      'when role is "%s", then returns "%s"',
      (role, expected) => {
        expect(mapJmapRoleToMailboxType(role)).toBe(expected);
      },
    );

    it('when role is "junk", then returns "spam"', () => {
      expect(mapJmapRoleToMailboxType('junk')).toBe('spam');
    });

    it('when role is null, then returns null', () => {
      expect(mapJmapRoleToMailboxType(null)).toBeNull();
    });

    it('when role is an unknown value, then returns null', () => {
      expect(mapJmapRoleToMailboxType('flagged' as MailboxRole)).toBeNull();
      expect(mapJmapRoleToMailboxType('important' as MailboxRole)).toBeNull();
      expect(mapJmapRoleToMailboxType('subscribed' as MailboxRole)).toBeNull();
    });
  });

  describe('mapMailboxTypeToJmapRole', () => {
    const reverseMappings: [MailboxType, MailboxRole][] = [
      ['inbox', 'inbox'],
      ['drafts', 'drafts'],
      ['sent', 'sent'],
      ['trash', 'trash'],
      ['archive', 'archive'],
    ];

    it.each(reverseMappings)(
      'when type is "%s", then returns "%s"',
      (type, expected) => {
        expect(mapMailboxTypeToJmapRole(type)).toBe(expected);
      },
    );

    it('when type is "spam", then returns "junk"', () => {
      expect(mapMailboxTypeToJmapRole('spam')).toBe('junk');
    });
  });

  describe('mapJmapMailbox', () => {
    it('when given a JMAP mailbox, then maps id, name, parentId, and counts', () => {
      const jmapMailbox = newJmapMailbox({ role: 'inbox' });

      const result = mapJmapMailbox(jmapMailbox);

      expect(result.id).toBe(jmapMailbox.id);
      expect(result.name).toBe(jmapMailbox.name);
      expect(result.parentId).toBe(jmapMailbox.parentId);
      expect(result.totalEmails).toBe(jmapMailbox.totalEmails);
      expect(result.unreadEmails).toBe(jmapMailbox.unreadEmails);
    });

    it('when given a JMAP mailbox with role, then maps role to type', () => {
      const jmapMailbox = newJmapMailbox({ role: 'junk' });

      const result = mapJmapMailbox(jmapMailbox);

      expect(result.type).toBe('spam');
    });

    it('when given a JMAP mailbox with null role, then type is null', () => {
      const jmapMailbox = newJmapMailbox({ role: null });

      const result = mapJmapMailbox(jmapMailbox);

      expect(result.type).toBeNull();
    });

    it('when given a JMAP mailbox, then drops sortOrder, isSubscribed, and thread counts', () => {
      const jmapMailbox = newJmapMailbox({
        sortOrder: 5,
        isSubscribed: true,
        totalThreads: 100,
        unreadThreads: 10,
      });

      const result = mapJmapMailbox(jmapMailbox);

      expect(result).not.toHaveProperty('sortOrder');
      expect(result).not.toHaveProperty('isSubscribed');
      expect(result).not.toHaveProperty('totalThreads');
      expect(result).not.toHaveProperty('unreadThreads');
    });
  });

  describe('mapJmapEmailToSummary', () => {
    it('when email has $seen keyword, then isRead is true', () => {
      const jmapEmail = newJmapEmail({
        keywords: { $seen: true },
      });

      const result = mapJmapEmailToSummary(jmapEmail);

      expect(result.isRead).toBe(true);
    });

    it('when email lacks $seen keyword, then isRead is false', () => {
      const jmapEmail = newJmapEmail({ keywords: {} });

      const result = mapJmapEmailToSummary(jmapEmail);

      expect(result.isRead).toBe(false);
    });

    it('when email has $flagged keyword, then isFlagged is true', () => {
      const jmapEmail = newJmapEmail({
        keywords: { $flagged: true },
      });

      const result = mapJmapEmailToSummary(jmapEmail);

      expect(result.isFlagged).toBe(true);
    });

    it('when email lacks $flagged keyword, then isFlagged is false', () => {
      const jmapEmail = newJmapEmail({ keywords: {} });

      const result = mapJmapEmailToSummary(jmapEmail);

      expect(result.isFlagged).toBe(false);
    });

    it('when email has both $seen and $flagged, then both booleans are true', () => {
      const jmapEmail = newJmapEmail({
        keywords: { $seen: true, $flagged: true },
      });

      const result = mapJmapEmailToSummary(jmapEmail);

      expect(result.isRead).toBe(true);
      expect(result.isFlagged).toBe(true);
    });

    it('when email has no keywords object, then isRead and isFlagged are false', () => {
      const jmapEmail = newJmapEmail();
      // @ts-expect-error simulating missing keywords from JMAP
      jmapEmail.keywords = undefined;

      const result = mapJmapEmailToSummary(jmapEmail);

      expect(result.isRead).toBe(false);
      expect(result.isFlagged).toBe(false);
    });

    it('when given a JMAP email, then maps scalar fields directly', () => {
      const jmapEmail = newJmapEmail();

      const result = mapJmapEmailToSummary(jmapEmail);

      expect(result.id).toBe(jmapEmail.id);
      expect(result.threadId).toBe(jmapEmail.threadId);
      expect(result.subject).toBe(jmapEmail.subject);
      expect(result.receivedAt).toBe(jmapEmail.receivedAt);
      expect(result.preview).toBe(jmapEmail.preview);
      expect(result.size).toBe(jmapEmail.size);
      expect(result.hasAttachment).toBe(jmapEmail.hasAttachment);
    });

    it('when email has no from/to, then returns empty arrays', () => {
      const jmapEmail = newJmapEmail({ from: undefined, to: undefined });

      const result = mapJmapEmailToSummary(jmapEmail);

      expect(result.from).toEqual([]);
      expect(result.to).toEqual([]);
    });

    it('when email has from/to addresses, then maps them directly', () => {
      const from = [newJmapEmailAddress()];
      const to = [newJmapEmailAddress(), newJmapEmailAddress()];
      const jmapEmail = newJmapEmail({ from, to });

      const result = mapJmapEmailToSummary(jmapEmail);

      expect(result.from).toEqual(from);
      expect(result.to).toEqual(to);
    });

    it('when email has no subject, then defaults to empty string', () => {
      const jmapEmail = newJmapEmail({ subject: undefined });

      const result = mapJmapEmailToSummary(jmapEmail);

      expect(result.subject).toBe('');
    });
  });

  describe('mapJmapEmailToDetail', () => {
    it('when email has bodyValues, then extracts text body content', () => {
      const partId = 'text-part';
      const textContent = 'Hello world';
      const jmapEmail = newJmapEmail({
        textBody: [{ partId, type: 'text/plain' }],
        bodyValues: {
          [partId]: {
            value: textContent,
            isEncodingProblem: false,
            isTruncated: false,
          },
        },
      });

      const result = mapJmapEmailToDetail(jmapEmail);

      expect(result.textBody).toBe(textContent);
    });

    it('when email has bodyValues, then extracts html body content', () => {
      const partId = 'html-part';
      const htmlContent = '<p>Hello</p>';
      const jmapEmail = newJmapEmail({
        htmlBody: [{ partId, type: 'text/html' }],
        bodyValues: {
          [partId]: {
            value: htmlContent,
            isEncodingProblem: false,
            isTruncated: false,
          },
        },
      });

      const result = mapJmapEmailToDetail(jmapEmail);

      expect(result.htmlBody).toBe(htmlContent);
    });

    it('when email has no bodyValues, then body fields are null', () => {
      const jmapEmail = newJmapEmail({ bodyValues: undefined });

      const result = mapJmapEmailToDetail(jmapEmail);

      expect(result.textBody).toBeNull();
      expect(result.htmlBody).toBeNull();
    });

    it('when email has empty textBody array, then textBody is null', () => {
      const jmapEmail = newJmapEmail({ textBody: [], bodyValues: {} });

      const result = mapJmapEmailToDetail(jmapEmail);

      expect(result.textBody).toBeNull();
    });

    it('when given a JMAP email, then includes all summary fields', () => {
      const jmapEmail = newJmapEmail();

      const detail = mapJmapEmailToDetail(jmapEmail);
      const summary = mapJmapEmailToSummary(jmapEmail);

      expect(detail.id).toBe(summary.id);
      expect(detail.threadId).toBe(summary.threadId);
      expect(detail.from).toEqual(summary.from);
      expect(detail.to).toEqual(summary.to);
      expect(detail.subject).toBe(summary.subject);
      expect(detail.isRead).toBe(summary.isRead);
      expect(detail.isFlagged).toBe(summary.isFlagged);
    });

    it('when email has cc/bcc/replyTo, then maps them', () => {
      const cc = [newJmapEmailAddress()];
      const bcc = [newJmapEmailAddress()];
      const replyTo = [newJmapEmailAddress()];
      const jmapEmail = newJmapEmail({ cc, bcc, replyTo });

      const result = mapJmapEmailToDetail(jmapEmail);

      expect(result.cc).toEqual(cc);
      expect(result.bcc).toEqual(bcc);
      expect(result.replyTo).toEqual(replyTo);
    });

    it('when email has no cc/bcc/replyTo, then defaults to empty arrays', () => {
      const jmapEmail = newJmapEmail({
        cc: undefined,
        bcc: undefined,
        replyTo: undefined,
      });

      const result = mapJmapEmailToDetail(jmapEmail);

      expect(result.cc).toEqual([]);
      expect(result.bcc).toEqual([]);
      expect(result.replyTo).toEqual([]);
    });

    it('when email has no sentAt, then sentAt is null', () => {
      const jmapEmail = newJmapEmail({ sentAt: undefined });

      const result = mapJmapEmailToDetail(jmapEmail);

      expect(result.sentAt).toBeNull();
    });
  });

  describe('mapSendDtoToJmapCreate', () => {
    it('when given a send DTO and mailbox ID, then sets mailboxIds', () => {
      const dto = newSendEmailDto();
      const mailboxId = 'sent-mailbox-id';

      const result = mapSendDtoToJmapCreate(dto, mailboxId);

      expect(result.mailboxIds).toEqual({ [mailboxId]: true });
    });

    it('when given a send DTO, then sets $seen keyword', () => {
      const dto = newSendEmailDto();

      const result = mapSendDtoToJmapCreate(dto, 'mid');

      expect(result.keywords).toEqual({ $seen: true });
    });

    it('when DTO has to and subject, then maps them directly', () => {
      const to = [newEmailAddress()];
      const dto = newSendEmailDto({ to, subject: 'Test subject' });

      const result = mapSendDtoToJmapCreate(dto, 'mid');

      expect(result.to).toEqual(to);
      expect(result.subject).toBe('Test subject');
    });

    it('when DTO has cc and bcc, then includes them', () => {
      const cc = [newEmailAddress()];
      const bcc = [newEmailAddress()];
      const dto = newSendEmailDto({ cc, bcc });

      const result = mapSendDtoToJmapCreate(dto, 'mid');

      expect(result.cc).toEqual(cc);
      expect(result.bcc).toEqual(bcc);
    });

    it('when DTO has no cc and bcc, then omits them', () => {
      const dto = newSendEmailDto({ cc: undefined, bcc: undefined });

      const result = mapSendDtoToJmapCreate(dto, 'mid');

      expect(result.cc).toBeUndefined();
      expect(result.bcc).toBeUndefined();
    });

    it('when DTO has textBody, then creates text body part and bodyValues', () => {
      const dto = newSendEmailDto({ textBody: 'Hello' });

      const result = mapSendDtoToJmapCreate(dto, 'mid');

      expect(result.textBody).toEqual([{ partId: 'text', type: 'text/plain' }]);
      expect(result.bodyValues?.['text']?.value).toBe('Hello');
    });

    it('when DTO has htmlBody, then creates html body part and bodyValues', () => {
      const dto = newSendEmailDto({ htmlBody: '<p>Hi</p>' });

      const result = mapSendDtoToJmapCreate(dto, 'mid');

      expect(result.htmlBody).toEqual([{ partId: 'html', type: 'text/html' }]);
      expect(result.bodyValues?.['html']?.value).toBe('<p>Hi</p>');
    });

    it('when DTO has both textBody and htmlBody, then bodyValues contains both', () => {
      const dto = newSendEmailDto({
        textBody: 'Hello',
        htmlBody: '<p>Hello</p>',
      });

      const result = mapSendDtoToJmapCreate(dto, 'mid');

      expect(result.bodyValues?.['text']?.value).toBe('Hello');
      expect(result.bodyValues?.['html']?.value).toBe('<p>Hello</p>');
    });

    it('when DTO has no body content, then omits body parts and bodyValues', () => {
      const dto = newSendEmailDto({
        textBody: undefined,
        htmlBody: undefined,
      });

      const result = mapSendDtoToJmapCreate(dto, 'mid');

      expect(result.textBody).toBeUndefined();
      expect(result.htmlBody).toBeUndefined();
      expect(result.bodyValues).toBeUndefined();
    });
  });

  describe('mapDraftDtoToJmapCreate', () => {
    it('when given a draft DTO, then sets $draft keyword', () => {
      const dto = newDraftEmailDto();

      const result = mapDraftDtoToJmapCreate(dto, 'mid');

      expect(result.keywords).toEqual({ $draft: true });
    });

    it('when given a draft DTO and mailbox ID, then sets mailboxIds', () => {
      const dto = newDraftEmailDto();
      const mailboxId = 'drafts-mailbox-id';

      const result = mapDraftDtoToJmapCreate(dto, mailboxId);

      expect(result.mailboxIds).toEqual({ [mailboxId]: true });
    });

    it('when draft DTO has all fields empty, then creates minimal object', () => {
      const dto: DraftEmailDto = {};

      const result = mapDraftDtoToJmapCreate(dto, 'mid');

      expect(result.to).toBeUndefined();
      expect(result.cc).toBeUndefined();
      expect(result.bcc).toBeUndefined();
      expect(result.subject).toBeUndefined();
      expect(result.textBody).toBeUndefined();
      expect(result.htmlBody).toBeUndefined();
      expect(result.mailboxIds).toEqual({ mid: true });
      expect(result.keywords).toEqual({ $draft: true });
    });

    it('when draft DTO has optional fields set, then include them', () => {
      const to = [newEmailAddress()];
      const cc = [newEmailAddress()];
      const dto = newDraftEmailDto({
        to,
        cc,
        subject: 'Draft subject',
        textBody: 'Draft text',
      });

      const result = mapDraftDtoToJmapCreate(dto, 'mid');

      expect(result.to).toEqual(to);
      expect(result.cc).toEqual(cc);
      expect(result.subject).toBe('Draft subject');
      expect(result.bodyValues?.['text']?.value).toBe('Draft text');
    });
  });

  describe('roundtrip consistency', () => {
    it('when mapping all mailbox types through both directions, then roundtrips are consistent', () => {
      const types: MailboxType[] = [
        'inbox',
        'drafts',
        'sent',
        'trash',
        'spam',
        'archive',
      ];

      for (const type of types) {
        const role = mapMailboxTypeToJmapRole(type);
        const backToType = mapJmapRoleToMailboxType(role);
        expect(backToType).toBe(type);
      }
    });
  });
});
