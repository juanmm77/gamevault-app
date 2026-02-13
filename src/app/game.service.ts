import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  Firestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  serverTimestamp
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { environment } from '../environments/environment';

export interface Game {
  id: number;
  name: string;
  background_image: string | null;
  released: string;
  description_raw: string;
  rating: number;
  genres?: { id: number; name: string }[];
  platforms?: { platform: { id: number; name: string } }[];
  developers?: { id: number; name: string }[];
  metacritic?: number;
  website?: string;
}

export interface GameListResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: Game[];
}

export interface Genre {
  id: number;
  name: string;
  slug: string;
}

export interface Platform {
  id: number;
  name: string;
  slug: string;
}

export interface GameParams {
  page?: number;
  page_size?: number;
  ordering?: string;
  genres?: string;
  dates?: string;
  metacritic?: string;
  search?: string;
  platforms?: string;
}

@Injectable({
  providedIn: 'root'
})
export class GameService {
  private apiKey = environment.gamesApi.apiKey;
  private baseUrl = environment.gamesApi.baseUrl;
  private readonly DEFAULT_PAGE_SIZE = '21'; // Renombrado para claridad

  constructor(
    private http: HttpClient,
    private firestore: Firestore,
    private auth: Auth
  ) {}

  getGameImage(imageUrl: string | null): string {
    return imageUrl ? imageUrl : 'assets/images/placeholder-game.png';
  }

  // =========================
  // RAWG API
  // =========================

  getGames(page: number = 1): Observable<GameListResponse> {
    return this.http.get<GameListResponse>(`${this.baseUrl}/games`, {
      params: {
        key: this.apiKey,
        page: String(page),
        page_size: this.DEFAULT_PAGE_SIZE
      }
    });
  }

  searchGames(query: string, page: number = 1, pageSize: number = 21): Observable<GameListResponse> {
    if (!query || query.trim() === '') {
      return this.getGames(page);
    }

    return this.http.get<GameListResponse>(`${this.baseUrl}/games`, {
      params: {
        key: this.apiKey,
        search: query,
        page: String(page),
        page_size: String(pageSize) // ✅ Ahora acepta el tamaño enviado
      }
    });
  }

  discoverGames(params: GameParams): Observable<GameListResponse> {
    const isMetacriticOrdering =
      params.ordering === 'metacritic' || params.ordering === '-metacritic';

    const safeParams: GameParams = { ...params };

    if (isMetacriticOrdering && !safeParams.metacritic) {
      safeParams.metacritic = '1,100';
    }

    // ✅ CORRECCIÓN CLAVE: Priorizamos safeParams.page_size si existe, sino usamos DEFAULT
    const finalPageSize = safeParams.page_size ? String(safeParams.page_size) : this.DEFAULT_PAGE_SIZE;

    let httpParams = new HttpParams()
      .set('key', this.apiKey)
      .set('page_size', finalPageSize);

    if (safeParams.page) httpParams = httpParams.set('page', safeParams.page.toString());
    if (safeParams.ordering) httpParams = httpParams.set('ordering', safeParams.ordering);
    if (safeParams.genres) httpParams = httpParams.set('genres', safeParams.genres);
    if (safeParams.dates) httpParams = httpParams.set('dates', safeParams.dates);
    if (safeParams.metacritic) httpParams = httpParams.set('metacritic', safeParams.metacritic);
    if (safeParams.search) httpParams = httpParams.set('search', safeParams.search);
    if (safeParams.platforms) httpParams = httpParams.set('platforms', safeParams.platforms);

    return this.http.get<GameListResponse>(`${this.baseUrl}/games`, { params: httpParams });
  }

  getGameById(id: number): Observable<Game> {
    return this.http.get<Game>(`${this.baseUrl}/games/${id}`, {
      params: { key: this.apiKey }
    });
  }

  getGenres(): Observable<{ results: Genre[] }> {
    return this.http.get<{ results: Genre[] }>(`${this.baseUrl}/genres`, {
      params: {
        key: this.apiKey,
        page_size: '50'
      }
    });
  }

  getPlatforms(): Observable<{ results: Platform[] }> {
    return this.http.get<{ results: Platform[] }>(`${this.baseUrl}/platforms`, {
      params: {
        key: this.apiKey,
        page_size: '50'
      }
    });
  }

  // =========================
  // Firebase (Favoritos)
  // =========================

  private favoriteDocPath(uid: string, gameId: number) {
    return `users/${uid}/favorites/${gameId}`;
  }

  private favoriteCollectionPath(uid: string) {
    return `users/${uid}/favorites`;
  }

  async addFavorite(game: Game) {
    const user = this.auth.currentUser;
    if (!user) return;

    const ref = doc(this.firestore, this.favoriteDocPath(user.uid, game.id));

    const payload = {
      gameId: game.id,
      name: game.name,
      background_image: game.background_image,
      createdAt: serverTimestamp()
    };

    await setDoc(ref, payload, { merge: true });
  }

  async removeFavorite(gameId: number) {
    const user = this.auth.currentUser;
    if (!user) return;

    const ref = doc(this.firestore, this.favoriteDocPath(user.uid, gameId));
    await deleteDoc(ref);
  }

  async isFavorite(gameId: number): Promise<boolean> {
    const user = this.auth.currentUser;
    if (!user) return false;

    const ref = doc(this.firestore, this.favoriteDocPath(user.uid, gameId));
    const snap = await getDoc(ref);
    return snap.exists();
  }

  async getFavorites(): Promise<any[]> {
    const user = this.auth.currentUser;
    if (!user) return [];

    const ref = collection(this.firestore, this.favoriteCollectionPath(user.uid));
    const snap = await getDocs(ref);
    return snap.docs.map(d => d.data());
  }

  async getFavoriteIds(): Promise<Set<number>> {
    const user = this.auth.currentUser;
    if (!user) return new Set();

    const ref = collection(this.firestore, this.favoriteCollectionPath(user.uid));
    const snap = await getDocs(ref);

    const ids = snap.docs.map(d => Number(d.id)).filter(n => Number.isFinite(n));
    return new Set(ids);
  }
}

