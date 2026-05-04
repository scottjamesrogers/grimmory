import {inject} from '@angular/core';
import {ActivatedRouteSnapshot, CanActivateFn, GuardResult, MaybeAsync, Router, RouterStateSnapshot, UrlTree} from '@angular/router';
import {map, Observable} from 'rxjs';
import {AuthService} from '../../shared/service/auth.service';
import {RemoteAuthRecoveryService} from './remote-auth-recovery.service';

export const AuthGuard: CanActivateFn = (route: ActivatedRouteSnapshot, state: RouterStateSnapshot): MaybeAsync<GuardResult> => {
  void route;
  void state;
  const router = inject(Router);
  const authService = inject(AuthService);
  const recovery = inject(RemoteAuthRecoveryService);

  const internalAccessToken = authService.getInternalAccessToken();

  if (internalAccessToken) {
    try {
      const payload = JSON.parse(atob(internalAccessToken.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        if (recovery.isEnabled()) {
          return recoverOrRedirect(recovery, router);
        }
        localStorage.removeItem('accessToken_Internal');
        return router.createUrlTree(['/login']);
      }
      if (payload.isDefaultPassword) {
        router.navigate(['/change-password']);
        return false;
      }
      return true;
    } catch {
      localStorage.removeItem('accessToken_Internal');
      router.navigate(['/login']);
      return false;
    }
  }

  if (recovery.isEnabled()) {
    return recoverOrRedirect(recovery, router);
  }
  router.navigate(['/login']);
  return false;
};

function recoverOrRedirect(recovery: RemoteAuthRecoveryService, router: Router): Observable<true | UrlTree> {
  return recovery.recover().pipe(
    map(ok => {
      if (ok) {
        return true;
      }
      localStorage.removeItem('accessToken_Internal');
      return router.createUrlTree(['/login']);
    })
  );
}
