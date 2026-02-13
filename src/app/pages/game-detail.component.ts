import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Location, CommonModule } from '@angular/common';
import { GameService, Game } from '../game.service';

@Component({
  selector: 'app-game-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './game-detail.html',
  
})
export class GameDetailComponent implements OnInit {
  game: Game | undefined; 
  loading = true; 

  constructor(
    private route: ActivatedRoute, 
    public gameService: GameService,
    private location: Location // Servicio inyectado correctamente
  ) {}

  ngOnInit() {
    this.loadGameDetail();
  }

  loadGameDetail() {
    this.loading = true;
    const id = Number(this.route.snapshot.paramMap.get('id'));
    
    this.gameService.getGameById(id).subscribe({
      next: (data: Game) => {
        this.game = data;
        this.loading = false; 
      },
      error: (err) => {
        console.error('Error al cargar el videojuego:', err);
        this.loading = false;
        this.game = undefined;
      }
    });
  }

  // Este es el método que llama al historial del navegador
  volver() {
    this.location.back();
  }
}