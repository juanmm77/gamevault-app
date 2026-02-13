import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, user } from '@angular/fire/auth';
import { map, take } from 'rxjs/operators';

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(Auth);
  const router = inject(Router);

  return user(auth).pipe(
    take(1),
    map(u => {
      if (u) {
        return true; // Hay usuario, puede pasar
      } else {
        // No hay usuario, lo mandamos al login
        return router.createUrlTree(['/login']);
      }
    })
  );
};