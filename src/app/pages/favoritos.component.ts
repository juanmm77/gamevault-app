import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GameService } from '../game.service'; 
import { ToastService } from '../toast.service';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-favoritos',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './favoritos.html',
  
})
export class FavoritosComponent implements OnInit {
  favorites: any[] = []; 
  loading = true;
  pending: Set<number> = new Set();
  searchTerm = '';
  filteredFavorites: any[] = []; 

  constructor(public gameService: GameService, private toast: ToastService) {} 

  async ngOnInit() {
    await this.loadData();
  }

  // Carga inicial de datos desde Firebase
  async loadData() {
    this.loading = true;
    try {
      const data = await this.gameService.getFavorites();
      // Ordenamos alfabéticamente por defecto para que la lista sea predecible
      this.favorites = data.sort((a, b) => a.name.localeCompare(b.name));
      this.applyFilters();
    } catch (error) {
      this.toast.show('🚨 Error al cargar favoritos');
      console.error(error);
    } finally {
      this.loading = false;
    }
  }

  async remove(id: number) {
    if (this.pending.has(id)) return;
    
    this.pending.add(id);
    try {
      // 1. Eliminamos de Firebase
      await this.gameService.removeFavorite(id);
      
      // 2. Actualizamos el array local comparando contra id y gameId
      this.favorites = this.favorites.filter(g => 
        Number(g.id || g.gameId) !== Number(id)
      );
      
      // 3. Refrescamos la vista
      this.applyFilters();
      this.toast.show('X Eliminado de favoritos');
    } catch (error) {
      this.toast.show('X Error al eliminar el juego');
    } finally {
      this.pending.delete(id);
    }
  }

  // Lógica simplificada: solo búsqueda por nombre
  applyFilters() {
    if (!this.searchTerm.trim()) {
      this.filteredFavorites = [...this.favorites];
      return;
    }

    const term = this.searchTerm.toLowerCase();
    this.filteredFavorites = this.favorites.filter(game => 
      game.name.toLowerCase().includes(term)
    );
  }
}