import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { GameService, Game, GameParams, Genre, Platform } from '../game.service';
import { Auth, user } from '@angular/fire/auth';
import { RouterLink } from '@angular/router';
import { ToastService } from '../toast.service';
import { finalize } from 'rxjs/operators';
import { Subscription } from 'rxjs';
import { User } from 'firebase/auth';

@Component({
  selector: 'app-game-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './game-list.html'
})
export class GameListComponent implements OnInit, OnDestroy {

  games: Game[] = [];
  genres: Genre[] = [];
  platforms: Platform[] = [];
  loading = true;
  searchTerm = '';

  offset = 0;
  limit = 21; // Mantenemos el límite visual de 21
  total = 0;

  releaseYear: number | null = null;
  selectedGenreId: number | null = null;
  selectedPlatformId: number | null = null;

  currentPage = 1;
  totalPages = 0;

  favorites: Set<number> = new Set<number>();
  pending: Set<number> = new Set<number>();

  user: User | null = null;
  private authSub?: Subscription;

  constructor(
    public gameService: GameService,
    private auth: Auth,
    private toast: ToastService
  ) {}

  ngOnInit() {
    this.authSub = user(this.auth).subscribe(async (u) => {
      this.user = u;
      if (u) {
        await this.markFavorites();
      } else {
        this.favorites = new Set<number>();
      }
    });

    this.loadGenres();
    this.loadPlatforms();
    this.loadGames();
  }

  ngOnDestroy() {
    this.authSub?.unsubscribe();
  }

  loadGenres() {
    this.gameService.getGenres().subscribe({
      next: data => this.genres = data.results,
      error: err => console.error('Error al cargar géneros', err)
    });
  }

  loadPlatforms() {
    this.gameService.getPlatforms().subscribe({
      next: data => this.platforms = data.results,
      error: err => console.error('Error al cargar plataformas', err)
    });
  }

  async markFavorites() {
    if (!this.user) {
      this.favorites = new Set<number>();
      return;
    }
    try {
      this.favorites = await this.gameService.getFavoriteIds();
    } catch (error) {
      console.error('Error al marcar favoritos:', error);
      this.favorites = new Set<number>();
    }
  }

  loadGames() {
    this.loading = true;
    const page = Math.floor(this.offset / this.limit) + 1;

    if (this.searchTerm.trim() !== '') {
      this.searchGames(this.searchTerm, page);
      return;
    }

    this.discoverGames(page);
  }

  // ✅ MODIFICADO: Filtra y recorta exactamente a 21
  processResponse(data: any) {
    // 1. Filtramos los que NO tienen imagen
    const filtered = data.results.filter((game: Game) => game.background_image !== null);
    
    // 2. Recortamos a los primeros 21 (this.limit)
    this.games = filtered.slice(0, this.limit);
    
    this.total = data.count;
    this.currentPage = Math.floor(this.offset / this.limit) + 1;
    this.totalPages = Math.ceil(data.count / this.limit);

    if (this.user) this.markFavorites();
  }

  searchGames(name: string, page: number) {
    this.loading = true;
    this.gameService.searchGames(name, page)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: data => this.processResponse(data),
        error: err => {
          this.toast.show('🔴 Error en la búsqueda de juegos.');
          console.error(err);
        }
      });
  }

  discoverGames(page: number) {
    this.loading = true;

    const params: GameParams = {
      page,
      page_size: 25, // ✅ PEDIMOS 25 PARA TENER MARGEN TRAS FILTRAR IMÁGENES
      ordering: '-metacritic'
    };

    if (this.releaseYear) {
      params.dates = `${this.releaseYear}-01-01,${this.releaseYear}-12-31`;
    }
    if (this.selectedGenreId) {
      params.genres = this.selectedGenreId.toString();
    }
    if (this.selectedPlatformId) {
      params.platforms = this.selectedPlatformId.toString();
    }

    this.gameService.discoverGames(params)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: data => this.processResponse(data),
        error: err => {
          this.toast.show('🔴 Error en el filtrado de juegos.');
          console.error(err);
        }
      });
  }

  onSearch() {
    this.offset = 0;
    this.loadGames();
  }

  nextPage() {
    if (this.currentPage >= this.totalPages) return;
    this.offset += this.limit;
    this.loadGames();
  }

  prevPage() {
    if (this.offset === 0) return;
    this.offset -= this.limit;
    this.loadGames();
  }

  clearFilters() {
    this.releaseYear = null;
    this.selectedGenreId = null;
    this.selectedPlatformId = null;
    this.searchTerm = '';
    this.offset = 0;
    this.loadGames();
  }

  async toggleFavorite(game: Game) {
    if (!this.user) {
      this.toast.show('🔒 Inicia sesión para agregar a favoritos');
      return;
    }
    const id = game.id;
    if (this.pending.has(id)) return;
    this.pending.add(id);

    try {
      if (this.favorites.has(id)) {
        await this.gameService.removeFavorite(id);
        this.favorites.delete(id);
        this.toast.show('❌ Eliminado de favoritos');
      } else {
        await this.gameService.addFavorite(game);
        this.favorites.add(id);
        this.toast.show('✅ Agregado a favoritos');
      }
    } catch (e) {
      console.error(e);
      this.toast.show('🚨 Error al guardar favorito');
    } finally {
      this.pending.delete(id);
    }
  }
}







