// --- HERRAMIENTAS DE ANGULAR Y WEB ---
import { Injectable } from '@angular/core'; // Permite que este servicio se pueda "inyectar" en cualquier componente
import { HttpClient, HttpParams } from '@angular/common/http'; // El "cartero" que pide datos a la API en internet
import { Observable } from 'rxjs'; // Maneja la respuesta de la API (que no es instantánea)

// --- HERRAMIENTAS DE FIREBASE (BASE DE DATOS Y USUARIOS) ---
import { Firestore, collection, doc, setDoc, deleteDoc, getDoc, getDocs, serverTimestamp } from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth'; // Para saber quién es el usuario que está usando la app

// --- CONFIGURACIÓN ---
import { environment } from '../environments/environment'; // Aquí guardamos las llaves secretas y la URL de la API

// --- MOLDES DE DATOS (INTERFACES) ---
// Definen qué datos tiene un "Juego", un "Género", etc.

export interface Game {  //para cada juego individual
  id: number;
  name: string;
  background_image: string | null;
  released: string;
  description_raw: string;
  rating: number;
  genres?: { id: number; name: string }[];  // para typescript, el ? significa que la propiedad es opcional
  platforms?: { platform: { id: number; name: string } }[];
  developers?: { id: number; name: string }[];
  website?: string;
}

export interface GameListResponse { //molde respuesta de la API (listado)
  count: number;    //// Cantidad total de juegos que existen en la API
  next: string | null;
  previous: string | null;
  results: Game[];
}

export interface Genre {
  id: number;
  name: string;
  slug: string;  // Nombre amigable para la URL (ej: "action")
}

export interface Platform {
  id: number;
  name: string;
  slug: string; 
}

// Define qué podemos enviarle a la API para filtrar (ej: buscar por nombre o año)
export interface GameParams {
  page?: number;
  page_size?: number;
  genres?: string;
  dates?: string;
  search?: string;
  platforms?: string;
}

@Injectable({         //Decorador. Sirve para que los componentes puedan usar las funciones del servicio 
  providedIn: 'root'  //creado abajo, GameService
})
export class GameService {
  // Leemos las llaves secretas desde el archivo de ambiente
  private apiKey = environment.gamesApi.apiKey;
  private baseUrl = environment.gamesApi.baseUrl;
  private readonly DEFAULT_PAGE_SIZE = '21'; 

  constructor(
    private http: HttpClient,    // Inicializamos el mensajero HTTP para peticiones
    private firestore: Firestore, // Inicializamos la base de datos Firestore
    private auth: Auth           // Inicializamos el sistema de autenticación
  ) {}

  // Si un juego no tiene imagen, ponemos una por defecto
  getGameImage(imageUrl: string | null): string {
    return imageUrl ? imageUrl : 'assets/images/placeholder-game.png';
  }

  // PARTE 1: CONSUMO DE API REST. Metodos
  
  // Trae la lista general de juegos para la página principal
  getGames(page: number = 1): Observable<GameListResponse> {
    return this.http.get<GameListResponse>(`${this.baseUrl}/games`, {
      params: {
        key: this.apiKey,
        page: String(page),
        page_size: this.DEFAULT_PAGE_SIZE
      }
    });
  }

  // Busca juegos por el nombre que escribas en el buscador
  //verifica si el usuario escribio algo. Si está vacío llama a getgames para no mostrar vacío
  searchGames(query: string, page: number = 1, pageSize: number = 21): Observable<GameListResponse> {
    if (!query || query.trim() === '') {
      return this.getGames(page);
    }

    return this.http.get<GameListResponse>(`${this.baseUrl}/games`, {
      params: {
        key: this.apiKey,
        search: query,
        page: String(page),
        page_size: String(pageSize)
      }
    });
  }

  // Filtra juegos por categoría, plataforma o fecha. Lógica de filtrado
  discoverGames(params: GameParams): Observable<GameListResponse> {
    const safeParams: GameParams = { ...params };
    //cuantos juegos mostrar. Si se pide un nro lo muestra, sino por defecto 21
    const finalPageSize = safeParams.page_size ? String(safeParams.page_size) : this.DEFAULT_PAGE_SIZE;
    //constructor de URL
    let httpParams = new HttpParams()  //usamos let para que cada filtro se vaya agregando
      .set('key', this.apiKey)
      .set('page_size', finalPageSize);
    //se pegunta si se filtro por género o plataformas mediante IFs
    if (safeParams.page) httpParams = httpParams.set('page', safeParams.page.toString());
    if (safeParams.genres) httpParams = httpParams.set('genres', safeParams.genres);
    if (safeParams.dates) httpParams = httpParams.set('dates', safeParams.dates);
    if (safeParams.search) httpParams = httpParams.set('search', safeParams.search);
    if (safeParams.platforms) httpParams = httpParams.set('platforms', safeParams.platforms);

    //se forma la URL final
    return this.http.get<GameListResponse>(`${this.baseUrl}/games`, { params: httpParams });
  }

  // Trae la información detallada de un solo juego cuando cliqueamos
  getGameById(id: number): Observable<Game> {
    return this.http.get<Game>(`${this.baseUrl}/games/${id}`, {
      params: { key: this.apiKey }
    });
  }

  // Obtiene las categorías (acción, RPG, etc.) desde la API. Esto no filtra, solo completa la info del desplegable
  getGenres(): Observable<{ results: Genre[] }> {
    return this.http.get<{ results: Genre[] }>(`${this.baseUrl}/genres`, {
      params: {
        key: this.apiKey,
        page_size: '50'
      }
    });
  }

  // Obtiene las plataformas (PC, PS5, Xbox) desde la API
  getPlatforms(): Observable<{ results: Platform[] }> {
    return this.http.get<{ results: Platform[] }>(`${this.baseUrl}/platforms`, {
      params: {
        key: this.apiKey,
        page_size: '50'
      }
    });
  }

  
  
  // PARTE 2: CRUD CON FIREBASE

  // Crea la dirección única de un favorito: usuarios / ID_USUARIO / favoritos / ID_JUEGO
  private favoriteDocPath(uid: string, gameId: number) {
    return `users/${uid}/favorites/${gameId}`;
  }

  // Ruta para entrar a la carpeta completa de favoritos del usuario
  private favoriteCollectionPath(uid: string) {
    return `users/${uid}/favorites`;
  }

  // CREATE: Guarda un juego en la nube de Firebase
  async addFavorite(game: Game) {
    const user = this.auth.currentUser; // Chequeamos quién es el usuario y si hay alguien logueado
    if (!user) return;

    const ref = doc(this.firestore, this.favoriteDocPath(user.uid, game.id));

    const payload = {
      gameId: game.id,    //no guardamos todo el juego, sino los campos esenciales
      name: game.name,
      background_image: game.background_image,
      createdAt: serverTimestamp() // Sincroniza la hora con el servidor
    };

    // Guarda los datos y si ya existía el juego, mezcla la información (merge)
    await setDoc(ref, payload, { merge: true });
  }

  // DELETE: Borra un juego de la nube de Firebase
  async removeFavorite(gameId: number) {
    const user = this.auth.currentUser;
    if (!user) return;

    const ref = doc(this.firestore, this.favoriteDocPath(user.uid, gameId));
    await deleteDoc(ref);
  }

  // READ (Uno): Verifica si un juego ya está en favoritos
  async isFavorite(gameId: number): Promise<boolean> {
    const user = this.auth.currentUser;
    if (!user) return false;

    const ref = doc(this.firestore, this.favoriteDocPath(user.uid, gameId));
    const snap = await getDoc(ref);
    return snap.exists(); // Devuelve True si el archivo existe
  }

  // READ (Todos): Trae la lista completa de favoritos para mostrarla en pantalla
  async getFavorites(): Promise<any[]> {
    const user = this.auth.currentUser;
    if (!user) return [];

    const ref = collection(this.firestore, this.favoriteCollectionPath(user.uid));
    const snap = await getDocs(ref);
    return snap.docs.map(d => d.data()); // Transforma la respuesta de Google en una lista fácil de leer
  }

  // Obtiene solo los IDs de los favoritos (útil para poner los íconos de corazón)
  async getFavoriteIds(): Promise<Set<number>> {
    const user = this.auth.currentUser;
    if (!user) return new Set();

    const ref = collection(this.firestore, this.favoriteCollectionPath(user.uid));
    const snap = await getDocs(ref);

    const ids = snap.docs.map(d => Number(d.id)).filter(n => Number.isFinite(n));
    return new Set(ids);
  }
}

