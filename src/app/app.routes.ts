import { Routes } from '@angular/router';
import { RegisterComponent } from './pages/register.component';
import { LoginComponent } from './pages/login.component';
import { GameListComponent } from './pages/game-list.component'; 
import { FavoritosComponent } from './pages/favoritos.component';
import { GameDetailComponent } from './pages/game-detail.component'; 
import { authGuard } from './auth.guard'; 

export const routes: Routes = [
    // Redirección por defecto al nuevo path de juegos
    { path: '', redirectTo: '/juegos', pathMatch: 'full' },
    
    // Rutas públicas
    { path: 'register', component: RegisterComponent },
    { path: 'login', component: LoginComponent },
    { path: 'juegos', component: GameListComponent }, 

    // Rutas protegidas (Requieren Login)
    { 
      path: 'favoritos', 
      component: FavoritosComponent, 
      canActivate: [authGuard] 
    },
    
    { 
      path: 'juego/:id', 
      component: GameDetailComponent, 
      canActivate: [authGuard] 
    },
    
    // Ruta comodín revisada
    { path: '**', redirectTo: '/juegos' }
];