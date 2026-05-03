import {signal} from '@angular/core';
import {TestBed} from '@angular/core/testing';
import {Subject, firstValueFrom, of, throwError} from 'rxjs';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {AppSettingsService, PublicAppSettings} from '../../shared/service/app-settings.service';
import {AuthService} from '../../shared/service/auth.service';
import {RemoteAuthRecoveryService} from './remote-auth-recovery.service';

function settings(remoteAuthEnabled: boolean): PublicAppSettings {
  return {
    oidcEnabled: false,
    oidcForceOnlyMode: false,
    remoteAuthEnabled,
    oidcProviderDetails: undefined as unknown as PublicAppSettings['oidcProviderDetails'],
  };
}

describe('RemoteAuthRecoveryService', () => {
  const authService = {
    remoteLogin: vi.fn<() => unknown>(),
  };

  let publicAppSettings: ReturnType<typeof signal<PublicAppSettings | null>>;

  function configure(remoteAuthEnabled: boolean): RemoteAuthRecoveryService {
    publicAppSettings = signal<PublicAppSettings | null>(settings(remoteAuthEnabled));

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        RemoteAuthRecoveryService,
        {provide: AuthService, useValue: authService},
        {provide: AppSettingsService, useValue: {publicAppSettings}},
      ]
    });
    return TestBed.inject(RemoteAuthRecoveryService);
  }

  beforeEach(() => {
    vi.restoreAllMocks();
    authService.remoteLogin.mockReset();
  });

  it('reports disabled when remote-auth is off', () => {
    const service = configure(false);
    expect(service.isEnabled()).toBe(false);
  });

  it('reports enabled when remote-auth is on', () => {
    const service = configure(true);
    expect(service.isEnabled()).toBe(true);
  });

  it('returns false from recover() when remote-auth is disabled', async () => {
    const service = configure(false);

    const result = await firstValueFrom(service.recover());

    expect(result).toBe(false);
    expect(authService.remoteLogin).not.toHaveBeenCalled();
  });

  it('returns true when remoteLogin yields a token pair', async () => {
    const service = configure(true);
    authService.remoteLogin.mockReturnValue(of({accessToken: 'a', refreshToken: 'r'}));

    const result = await firstValueFrom(service.recover());

    expect(result).toBe(true);
    expect(authService.remoteLogin).toHaveBeenCalledOnce();
  });

  it('returns false when remoteLogin yields an empty token pair', async () => {
    const service = configure(true);
    authService.remoteLogin.mockReturnValue(of({accessToken: '', refreshToken: ''}));

    const result = await firstValueFrom(service.recover());

    expect(result).toBe(false);
  });

  it('returns false when remoteLogin errors', async () => {
    const service = configure(true);
    authService.remoteLogin.mockReturnValue(throwError(() => new Error('boom')));

    const result = await firstValueFrom(service.recover());

    expect(result).toBe(false);
  });

  it('coalesces concurrent recover() calls into a single remoteLogin', async () => {
    const service = configure(true);
    const subject = new Subject<{accessToken: string; refreshToken: string}>();
    authService.remoteLogin.mockReturnValue(subject.asObservable());

    const first = firstValueFrom(service.recover());
    const second = firstValueFrom(service.recover());

    subject.next({accessToken: 'a', refreshToken: 'r'});
    subject.complete();

    const [a, b] = await Promise.all([first, second]);

    expect(a).toBe(true);
    expect(b).toBe(true);
    expect(authService.remoteLogin).toHaveBeenCalledOnce();
  });
});
