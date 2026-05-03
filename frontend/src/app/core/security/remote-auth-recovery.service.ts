import {inject, Injectable} from '@angular/core';
import {BehaviorSubject, Observable, defer, filter, map, of, take, tap} from 'rxjs';
import {catchError} from 'rxjs/operators';
import {AppSettingsService} from '../../shared/service/app-settings.service';
import {AuthService} from '../../shared/service/auth.service';

@Injectable({providedIn: 'root'})
export class RemoteAuthRecoveryService {
  private appSettings = inject(AppSettingsService);
  private authService = inject(AuthService);

  private inFlight = false;
  private readonly result$ = new BehaviorSubject<boolean | null>(null);

  isEnabled(): boolean {
    return !!this.appSettings.publicAppSettings()?.remoteAuthEnabled;
  }

  recover(): Observable<boolean> {
    return defer(() => {
      if (!this.isEnabled()) {
        return of(false);
      }
      if (this.inFlight) {
        return this.result$.pipe(
          filter((v): v is boolean => v !== null),
          take(1),
        );
      }
      this.inFlight = true;
      this.result$.next(null);
      return this.authService.remoteLogin().pipe(
        map(response => !!(response.accessToken && response.refreshToken)),
        catchError(() => of(false)),
        tap(ok => {
          this.inFlight = false;
          this.result$.next(ok);
        }),
      );
    });
  }
}
