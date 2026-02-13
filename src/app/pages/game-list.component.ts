// -------------------- IMPORTS --------------------

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


// -------------------- DECORADOR @Component --------------------
// Le dice a Angular: "esta clase es un componente" y cómo se usa / qué necesita
@Component({
  selector: 'app-game-list',
  // standalone: true significa que NO depende de un NgModule para funcionar
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './game-list.html'
})


// -------------------- CLASE DEL COMPONENTE --------------------
// implements OnInit: permite usar ngOnInit() (se ejecuta al iniciar)
// implements OnDestroy: permite usar ngOnDestroy() (al salir/destruir componente)
export class GameListComponent implements OnInit, OnDestroy {

  // -------------------- VARIABLES DE DATOS --------------------

  // Lista final de juegos que se muestran en el HTML
  games: Game[] = [];

  // Listas para cargar los filtros (géneros y plataformas)
  genres: Genre[] = [];
  platforms: Platform[] = [];

  // loading controla si mostramos un spinner o indicador de carga
  loading = true;

  // searchTerm guarda el texto que el usuario escribe para buscar
  searchTerm = '';


  // -------------------- PAGINACIÓN --------------------
  offset = 0;
  limit = 21;
  total = 0;
  currentPage = 1;
  totalPages = 0;


  // -------------------- FILTROS SELECCIONADOS --------------------
  // null significa “no hay filtro aplicado”
  releaseYear: number | null = null;
  selectedGenreId: number | null = null;
  selectedPlatformId: number | null = null;


  // -------------------- ESTADO DE FAVORITOS Y USUARIO --------------------
  // favorites: guarda IDs de juegos favoritos (para saber si el corazón está marcado)
  favorites: Set<number> = new Set<number>();

  // pending: guarda IDs que están en proceso de guardado/borrado para evitar doble clic
  pending: Set<number> = new Set<number>();

  // user: usuario actual logueado (Firebase) o null si no hay sesión
  user: User | null = null;
  private authSub?: Subscription;


  // -------------------- CONSTRUCTOR (inyección de dependencias) --------------------
  // Angular nos inyecta servicios listos para usar
  constructor(
    public gameService: GameService, // público: se puede usar desde el HTML si quisieras
    private auth: Auth,              // Auth de Firebase
    private toast: ToastService      // Mostrar mensajes al usuario
  ) {}


  // -------------------- CICLO DE VIDA: ngOnInit --------------------
  // Se ejecuta UNA VEZ cuando el componente se “monta” en pantalla
  ngOnInit() {

    // Nos suscribimos al estado del usuario (Firebase)
    // Cada vez que el usuario inicia/cierra sesión, este observable emite un valor
    this.authSub = user(this.auth).subscribe(async (u) => {
      this.user = u;

      // Si hay usuario, cargamos favoritos desde Firebase
      if (u) {
        await this.markFavorites();
      } else {
        // Si no hay usuario, limpiamos favoritos
        this.favorites = new Set<number>();
      }
    });

    // Cargamos datos iniciales (filtros y lista de juegos)
    this.loadGenres();
    this.loadPlatforms();
    this.loadGames();
  }


  // -------------------- CICLO DE VIDA: ngOnDestroy --------------------
  // Se ejecuta cuando el componente se destruye (por ejemplo al cambiar de ruta)
  // Cancelamos la suscripción para evitar fugas de memoria
  ngOnDestroy() {
    this.authSub?.unsubscribe();
  }


  // -------------------- MÉTODOS DE CARGA --------------------

  // Carga géneros desde el servicio (API)
  loadGenres() {
    this.gameService.getGenres().subscribe({
      next: data => this.genres = data.results, // guardamos en la lista para el filtro
      error: err => console.error('Error al cargar géneros', err)
    });
  }

  // Carga plataformas desde el servicio (API)
  loadPlatforms() {
    this.gameService.getPlatforms().subscribe({
      next: data => this.platforms = data.results,
      error: err => console.error('Error al cargar plataformas', err)
    });
  }


  // Busca en Firebase qué juegos son favoritos del usuario logueado
  async markFavorites() {
    if (!this.user) {
      this.favorites = new Set<number>();
      return;
    }

    try {
      // getFavoriteIds debería devolver Set<number> con IDs de juegos favoritos
      this.favorites = await this.gameService.getFavoriteIds();
    } catch (error) {
      console.error('Error al marcar favoritos:', error);
      this.favorites = new Set<number>();
    }
  }


  // Decide si buscar por texto o usar filtros generales
  loadGames() {
    this.loading = true;
    window.scrollTo(0, 0);

    // calculamos página según offset y limit
    // ejemplo: offset 0 -> page 1, offset 21 -> page 2, etc.
    const page = Math.floor(this.offset / this.limit) + 1;

    // si hay texto en buscador, usamos search endpoint
    if (this.searchTerm.trim() !== '') {
      this.searchGames(this.searchTerm, page);
      return;
    }

    // si no hay texto, usamos discover con filtros
    this.discoverGames(page);
  }


  // Procesa la respuesta de la API:
  // 1) filtra juegos sin imagen
  // 2) recorta a 21 juegos
  // 3) calcula total/páginas
  // 4) marca favoritos si hay usuario
  processResponse(data: any) {

    // 1) filtramos juegos sin imagen para que no se vean tarjetas vacías
    const filtered = data.results.filter((game: Game) => game.background_image !== null);

    // 2) recortamos al límite del componente (21)
    this.games = filtered.slice(0, this.limit);

    // 3) guardamos valores de paginación
    this.total = data.count;
    this.currentPage = Math.floor(this.offset / this.limit) + 1;
    this.totalPages = Math.ceil(data.count / this.limit);

    // 4) si hay usuario logueado, sincronizamos corazones
    if (this.user) this.markFavorites();
  }


  // Llama al servicio para buscar por texto (search)
  searchGames(name: string, page: number) {
    this.loading = true;

    this.gameService.searchGames(name, page)
      // finalize: pase lo que pase (ok o error), apaga loading
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        // si sale bien, procesamos la respuesta
        next: data => this.processResponse(data),

        // si sale mal, mostramos toast y logueamos error
        error: err => {
          this.toast.show('X Error en la búsqueda.');
          console.error(err);
        }
      });
  }


  // Llama al servicio usando filtros (discover)
  discoverGames(page: number) {
    this.loading = true;

    // armamos parámetros para la API
    // pedimos 25 por si algunos vienen sin imagen y luego recortamos a 21
    const params: GameParams = {
      page,
      page_size: 25
    };

    // si se eligió un año, lo convertimos a rango de fechas
    if (this.releaseYear) {
      params.dates = `${this.releaseYear}-01-01,${this.releaseYear}-12-31`;
    }

    // si se eligió género/plataforma, los convertimos a string (como requiere la API)
    if (this.selectedGenreId) {
      params.genres = this.selectedGenreId.toString();
    }
    if (this.selectedPlatformId) {
      params.platforms = this.selectedPlatformId.toString();
    }

    // hacemos la llamada
    this.gameService.discoverGames(params)
      .pipe(finalize(() => this.loading = false))
      .subscribe({
        next: data => this.processResponse(data),
        error: err => {
          this.toast.show('X Error al filtrar juegos.');
          console.error(err);
        }
      });
  }


  // -------------------- NAVEGACIÓN Y FILTROS --------------------

  // cuando el usuario busca, volvemos a la primera página (offset 0)
  onSearch() {
    this.offset = 0;
    this.loadGames();
  }

  // página siguiente: aumentamos offset
  nextPage() {
    if (this.currentPage >= this.totalPages) return;
    this.offset += this.limit;
    this.loadGames();
  }

  // página anterior: disminuimos offset
  prevPage() {
    if (this.offset === 0) return;
    this.offset -= this.limit;
    this.loadGames();
  }

  // reset de filtros y buscador
  clearFilters() {
    this.releaseYear = null;
    this.selectedGenreId = null;
    this.selectedPlatformId = null;
    this.searchTerm = '';
    this.offset = 0;
    this.loadGames();
  }


  // -------------------- LÓGICA DE FAVORITOS (CRUD) --------------------
  // toggleFavorite: si es favorito lo elimina, si no lo agrega
  async toggleFavorite(game: Game) {

    // si no hay usuario logueado, no dejamos usar favoritos
    if (!this.user) {
      this.toast.show('Inicia sesión para usar favoritos');
      return;
    }

    const id = game.id;

    // si ya hay una operación en curso para ese juego, no hacemos nada (evita doble clic)
    if (this.pending.has(id)) return;
    this.pending.add(id);

    try {
      if (this.favorites.has(id)) {
        // DELETE: ya era favorito, lo borramos
        await this.gameService.removeFavorite(id);
        this.favorites.delete(id);
        this.toast.show('X Eliminado de favoritos');
      } else {
        // CREATE: no era favorito, lo agregamos
        await this.gameService.addFavorite(game);
        this.favorites.add(id);
        this.toast.show('Agregado a favoritos');
      }
    } catch (e) {
      // si algo falla, mostramos error
      console.error(e);
      this.toast.show('X Error al gestionar favorito');
    } finally {
      // siempre liberamos el bloqueo
      this.pending.delete(id);
    }
  }
}


