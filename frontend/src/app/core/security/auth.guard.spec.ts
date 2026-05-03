import {TestBed} from '@angular/core/testing';
import {ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree} from '@angular/router';
import {Observable, firstValueFrom, of} from 'rxjs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {AuthService} from '../../shared/service/auth.service';
import {AuthGuard} from './auth.guard';
import {RemoteAuthRecoveryService} from './remote-auth-recovery.service';

function buildToken(payload: Record<string, unknown>): string {
  return `header.${btoa(JSON.stringify(payload))}.signature`;
}

describe('AuthGuard', () => {
  const route = {} as ActivatedRouteSnapshot;
  const state = {} as RouterStateSnapshot;
  const router = {
    createUrlTree: vi.fn((commands: string[]) => ({commands}) as unknown as UrlTree),
    navigate: vi.fn(() => Promise.resolve(true)),
  };

  const authService = {
    getInternalAccessToken: vi.fn<() => string | null>(),
  };

  const recoveryService = {
    isEnabled: vi.fn<() => boolean>(),
    recover: vi.fn<() => Observable<boolean>>(),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    router.createUrlTree.mockClear();
    router.navigate.mockClear();
    authService.getInternalAccessToken.mockReset();
    recoveryService.isEnabled.mockReset();
    recoveryService.recover.mockReset();
    recoveryService.isEnabled.mockReturnValue(false);

    TestBed.configureTestingModule({
      providers: [
        {provide: Router, useValue: router},
        {provide: AuthService, useValue: authService},
        {provide: RemoteAuthRecoveryService, useValue: recoveryService},
      ]
    });
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('allows navigation for a valid non-default-password token', () => {
    authService.getInternalAccessToken.mockReturnValue(
      buildToken({exp: Math.floor(Date.now() / 1000) + 3600})
    );

    const result = TestBed.runInInjectionContext(() => AuthGuard(route, state));

    expect(result).toBe(true);
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('redirects to login when there is no token', () => {
    authService.getInternalAccessToken.mockReturnValue(null);

    const result = TestBed.runInInjectionContext(() => AuthGuard(route, state));

    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('returns a login UrlTree for expired tokens', () => {
    localStorage.setItem('accessToken_Internal', 'stale-token');
    authService.getInternalAccessToken.mockReturnValue(
      buildToken({exp: Math.floor(Date.now() / 1000) - 10})
    );

    const result = TestBed.runInInjectionContext(() => AuthGuard(route, state));

    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
    expect(result).toEqual({commands: ['/login']});
    expect(localStorage.getItem('accessToken_Internal')).toBeNull();
  });

  it('redirects to the change-password flow for default-password tokens', () => {
    authService.getInternalAccessToken.mockReturnValue(
      buildToken({exp: Math.floor(Date.now() / 1000) + 3600, isDefaultPassword: true})
    );

    const result = TestBed.runInInjectionContext(() => AuthGuard(route, state));

    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/change-password']);
  });

  it('clears the token and redirects to login for malformed tokens', () => {
    localStorage.setItem('accessToken_Internal', 'bad-token');
    authService.getInternalAccessToken.mockReturnValue('bad-token');

    const result = TestBed.runInInjectionContext(() => AuthGuard(route, state));

    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(localStorage.getItem('accessToken_Internal')).toBeNull();
  });

  it('runs remote-auth recovery when expired and recovery is enabled', async () => {
    localStorage.setItem('accessToken_Internal', 'stale-token');
    authService.getInternalAccessToken.mockReturnValue(
      buildToken({exp: Math.floor(Date.now() / 1000) - 10})
    );
    recoveryService.isEnabled.mockReturnValue(true);
    recoveryService.recover.mockReturnValue(of(true));

    const result = TestBed.runInInjectionContext(() => AuthGuard(route, state));
    const resolved = await firstValueFrom(result as Observable<true | UrlTree>);

    expect(recoveryService.recover).toHaveBeenCalledOnce();
    expect(resolved).toBe(true);
    expect(router.createUrlTree).not.toHaveBeenCalled();
  });

  it('redirects to login when remote-auth recovery fails on expired token', async () => {
    localStorage.setItem('accessToken_Internal', 'stale-token');
    authService.getInternalAccessToken.mockReturnValue(
      buildToken({exp: Math.floor(Date.now() / 1000) - 10})
    );
    recoveryService.isEnabled.mockReturnValue(true);
    recoveryService.recover.mockReturnValue(of(false));

    const result = TestBed.runInInjectionContext(() => AuthGuard(route, state));
    const resolved = await firstValueFrom(result as Observable<true | UrlTree>);

    expect(recoveryService.recover).toHaveBeenCalledOnce();
    expect(router.createUrlTree).toHaveBeenCalledWith(['/login']);
    expect(resolved).toEqual({commands: ['/login']});
    expect(localStorage.getItem('accessToken_Internal')).toBeNull();
  });

  it('runs remote-auth recovery instead of redirecting when no token is present', async () => {
    authService.getInternalAccessToken.mockReturnValue(null);
    recoveryService.isEnabled.mockReturnValue(true);
    recoveryService.recover.mockReturnValue(of(true));

    const result = TestBed.runInInjectionContext(() => AuthGuard(route, state));
    const resolved = await firstValueFrom(result as Observable<true | UrlTree>);

    expect(recoveryService.recover).toHaveBeenCalledOnce();
    expect(resolved).toBe(true);
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
