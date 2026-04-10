//https://www.youtube.com/watch?v=sVeK9h2TVHI&t=9s
//https://harrisonmilbradt.com/blog/canvas-panning-and-zooming für den Zoom
import {AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges,
  Output, SimpleChanges, ViewChild} from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {LoadingService} from '../../services/loading.service';
import {firstValueFrom} from 'rxjs';
import {MatButton} from '@angular/material/button';
import {NgIf} from '@angular/common';


interface Mask {
  mask: number[][];   //Punkte der Maske
  class: string;      //"text" | "formula"
  conf: number;
}

/**
 * Mögliches zukünftiges Feature:
 * - Soll als Annotationstool für die Bilder dienen, um Masken für das YOLO Modell zu erstellen, damit die OCR-Genauigkeit verbessert werden kann.
 * - Es könnte auch die Möglichkeit geben, die Masken zu löschen, falls sie falsch erstellt wurden oder nicht mehr benötigt werden.
 */
@Component({
  selector: 'app-mask-editor',
  imports: [
    MatButton,
    NgIf
  ],
  templateUrl: './mask-editor.component.html',
  styleUrl: './mask-editor.component.css',
  standalone: true
})
export class MaskEditorComponent implements AfterViewInit, OnChanges {
  constructor(private http: HttpClient, private loadingService: LoadingService) {
  }
  @Input() file!: File;
  @Input() masks!: Mask[];
  @Output() digText = new EventEmitter<string>();
  @Output() close = new EventEmitter<void>();
  @ViewChild('canvas', { static: true })
  canvasRef!: ElementRef<HTMLCanvasElement>;
  canvasImage!: HTMLImageElement;
  ctx!: CanvasRenderingContext2D;

  currentScaleFactor = 1;

  showContextMenu = false;
  contextMenuX = 0;
  contextMenuY = 0;
  selectedMaskIndex: number | null = null;
  selectedPolygon = 0; // Das gewählte Polygon ist immer an der ersten Stelle
  isPanning = false;
  previousMouse = { x: 0, y: 0 };



  viewportTransform = {
    scale: 1,
    x: 0,
    y: 0
  };


  ngAfterViewInit() {
    this.canvasImage = new Image();
    this.canvasImage.src = URL.createObjectURL(this.file);
    this.canvasImage.onload = () => {
      this.draw(); // jetzt kann draw direkt das geladene Bild verwenden
    };
    this.ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.canvasRef.nativeElement.addEventListener('wheel', this.onMouseWheel.bind(this));
    this.canvasRef.nativeElement.addEventListener('contextmenu', this.onRightClick.bind(this));
    document.addEventListener('click', () => this.showContextMenu = false); // Klick außerhalb schließt Menü
    this.canvasRef.nativeElement.addEventListener('mousedown', (e: MouseEvent) => {
      if(e.button ===1 ){ // Mittlere Maustaste
        this.isPanning = true;
        this.previousMouse = { x: e.clientX, y: e.clientY};
        e.preventDefault(); // Damit nicht gescrollt werden kann!
      }
    })
    this.canvasRef.nativeElement.addEventListener('mousemove', (e: MouseEvent) => {
      if(this.isPanning){
        const dx = e.clientX - this.previousMouse.x;
        const dy = e.clientY - this.previousMouse.y;

        this.viewportTransform.x += dx;
        this.viewportTransform.y += dy;

        this.previousMouse = { x: e.clientX, y: e.clientY };
        this.draw();
      }
    })
    this.canvasRef.nativeElement.addEventListener('mouseup', (e: MouseEvent) => {
      if(e.button ===1 ){
        this.isPanning = false;
      }
    })
    this.canvasRef.nativeElement.addEventListener('mouseleave', (e: MouseEvent) => {
      this.isPanning = false;
    })
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['masks'] && !changes['masks'].firstChange) {
      this.draw();
    }
  }

  /**
   * Berechnet die Koordinaten der Maus relativ zum Canvas, unter Berücksichtigung von Zoom und Pan.
   * @param e Das MouseEvent, das die aktuellen Mauspositionen enthält.
   */
  getMouseCoords(e: MouseEvent): {x: number; y: number} {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const x = (mouseX - this.viewportTransform.x) / this.viewportTransform.scale;
    const y = (mouseY - this.viewportTransform.y) / this.viewportTransform.scale;

    return {x,y}
  }


  /**
   * Event-Handler für den Rechtsklick.
   * Überprüft, ob der Rechtsklick innerhalb einer Maske erfolgt ist, und zeigt das Kontextmenü an, wenn dies der Fall ist.
   * @param e Das MouseEvent, das die aktuellen Mauspositionen enthält.
   */
  onRightClick(e: MouseEvent) {
    e.preventDefault();
    const { x, y } = this.getMouseCoords(e);

    for (let maskIndex = 0; maskIndex < this.masks.length; maskIndex++) {
      const mask = this.masks[maskIndex];
      const polygon = mask.mask[0]; // immer das erste Polygon
      const path = new Path2D();

      // @ts-ignore
      polygon.forEach(([px, py], i) => {
        const scaledX = px * this.currentScaleFactor;
        const scaledY = py * this.currentScaleFactor;
        i === 0 ? path.moveTo(scaledX, scaledY) : path.lineTo(scaledX, scaledY);
      });
      path.closePath();

      if (this.ctx.isPointInPath(path, x, y)) {
        this.showContextMenu = true;
        this.contextMenuX = e.clientX;
        this.contextMenuY = e.clientY;
        this.selectedMaskIndex = maskIndex;
        return;
      }
    }

    this.showContextMenu = false;
  }


  /**
   * Löscht die aktuell ausgewählte Maske.
   */
  deleteSelectedMask() {
    if (this.selectedMaskIndex !== null) {
      const mask = this.masks[this.selectedMaskIndex];
      mask.mask.splice(this.selectedPolygon, 1);
      if (mask.mask.length === 0){
        this.masks.splice(this.selectedMaskIndex, 1);
      }
      this.showContextMenu = false;
      this.draw();
    }
  }


  /**
   * Zeigt das Bild auf dem Canvas an.
   * Skaliert das Bild so, dass es in den Canvas passt, und zeichnet die Masken darüber.
   */
  draw() {
    const img = this.canvasImage;
    //console.log("Image loaded:", img.width, img.height);

    const canvas = this.canvasRef.nativeElement;
    const maxCanvasWidth = 600;
    const maxCanvasHeight = 800;

    // Berechne Skalierung, sodass Bild in Canvas passt
    const scaleX = maxCanvasWidth / img.width;
    const scaleY = maxCanvasHeight / img.height;
    const scaleFactor = Math.min(scaleX, scaleY);

    this.currentScaleFactor = scaleFactor;

    canvas.width = img.width * scaleFactor;
    canvas.height = img.height * scaleFactor;

    this.ctx.save();
    this.ctx.setTransform(
      this.viewportTransform.scale, 0,
      0, this.viewportTransform.scale,
      this.viewportTransform.x,
      this.viewportTransform.y
    );

    console.log("Mask in Editor: ", this.masks)

    this.ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    //console.log("Masks received:", this.masks);
    this.masks.forEach(mask => {
      const polygon = mask.mask[0]; // Polygon
      this.ctx.beginPath();
      // @ts-ignore
      polygon.forEach(([x, y], i) => {
        const scaledX = x * scaleFactor;
        const scaledY = y * scaleFactor;
        if(i == 0){
          this.ctx.moveTo(scaledX, scaledY)
        }else this.ctx.lineTo(scaledX, scaledY);

      });
      this.ctx.closePath();

      if (mask.class === "Textline") {
        this.ctx.fillStyle = 'rgba(255,0,0,0.3)';
        this.ctx.strokeStyle = 'red';
      } else {
        this.ctx.fillStyle = 'rgba(0,0,255,0.3)';
        this.ctx.strokeStyle = 'blue';
      }

      this.ctx.fill();
      this.ctx.stroke();

      // conf-Wert zeichnen
      // @ts-ignore
      const [firstX, firstY] = polygon[0]; // über dem ersten Punkt
      this.ctx.fillStyle = 'black';
      this.ctx.font = '14px Arial';
      this.ctx.fillText(mask.conf.toFixed(2), firstX * scaleFactor, firstY * scaleFactor - 5); // leicht oberhalb

    });


    this.ctx.restore();

  }

  //https://harrisonmilbradt.com/blog/canvas-panning-and-zooming für den Zoom
  /**
   * Aktualisiert die Zoomstufe.
   * Passt die Position so an, dass der Zoom um die aktuelle Mausposition erfolgt, damit der Benutzer die Details besser sehen kann.
   * @param e
   */
  updateZooming(e: WheelEvent) {
    e.preventDefault();
    const oldScale = this.viewportTransform.scale
    const oldX = this.viewportTransform.x
    const oldY = this.viewportTransform.y

    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;

    const previousScale = this.viewportTransform.scale;
    const newScale = previousScale * (1 - e.deltaY * 0.001); // feiner Zoom
    const newX= localX - (localX - oldX) * (newScale / previousScale)
    const newY = localY - (localY - oldY) * (newScale / previousScale)


    this.viewportTransform.x = newX;
    this.viewportTransform.y = newY;
    this.viewportTransform.scale = newScale;

    this.draw();
  }

  /**
   * Event-Handler für das Mausrad, der die Zoomstufe aktualisiert, wenn das Mausrad bewegt wird.
   * @param e Das WheelEvent, das die Informationen über die Bewegung des Mausrads enthält.
   */
  onMouseWheel(e: WheelEvent) {
    this.updateZooming(e);
  }

  /**
   * Schließt den Maskeneditor.
   */
  closeEditor() {
    this.close.emit();
  }

  //Kann eignetlich weg, bzw. könnte in Zukunft über eine andere REST-API aufgerufen werden.
  //async runOCR(){
  //  try{
  //    this.loadingService.loadingOn()

  //    await new Promise(resolve => setTimeout(resolve, 0));

  //    const formData = new FormData();
  //    formData.append('image', this.file);
  //    formData.append('masks', JSON.stringify(this.masks));

  //    const res: string[] = await firstValueFrom(this.http.post<string[]>('http://localhost:5000/run-ocr', formData));
  //    const markdownText = res.join('\n'); // Leerzeile zwischen den Texten
  //    this.digText.emit(markdownText);
  //    this.closeEditor();
  //  }catch(e){
  //    console.error("Error: ", e);
  //  }finally {
  //    this.loadingService.loadingOff();
  //  }
  //}
}
