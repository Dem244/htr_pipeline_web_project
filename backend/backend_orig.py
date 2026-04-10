#https://www.geeksforgeeks.org/python/flask-http-method/
#https://www.reddit.com/r/Rag/comments/1glr3gj/error_withtiktoken_when_using_sentencetransformer/
#https://stackoverflow.com/questions/58435218/intersection-over-union-on-non-rectangular-quadrilaterals
#https://docs.ultralytics.com/guides/isolating-segmentation-objects/#isolate-with-black-pixels-sub-options
#https://stackoverflow.com/questions/1342601/pythonic-way-of-checking-if-a-condition-holds-for-any-element-of-a-list (für rows)
#https://shapely.readthedocs.io/en/stable/reference/shapely.unary_union.html
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import os
import torch
import requests # wichti für Kommunikation mit zweiten Backend
import cv2
import numpy as np
from shapely.geometry import Polygon
from shapely.geometry import Polygon, MultiPolygon
from shapely.validation import make_valid
from shapely.ops import unary_union
from PIL import Image
from pathlib import Path
from transformers import TrOCRProcessor, VisionEncoderDecoderModel
import builtins

app = FastAPI()

# CORS-Konfiguration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],  # Angular Dev-Server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")

print(f"GPU use: {torch.cuda.is_available()}")

upload_dir = Path("uploads")
upload_dir.mkdir(exist_ok=True)
output_dir = Path("outputs")
output_dir.mkdir(exist_ok=True)
output_dir_box = Path("outputs_box_mask") # Generierter Text (maskenbasiert)
output_dir_box.mkdir(exist_ok=True)
save_dir_text = Path("text_crops")
save_dir_text.mkdir(exist_ok=True)
save_dir_formula = Path("formula_crops")
save_dir_formula.mkdir(exist_ok=True)

os.makedirs(upload_dir, exist_ok=True)
os.makedirs(output_dir, exist_ok=True)


## MIT GPU BEARBEITEN!!! WEGEN SCHNELLIGKEIT

#yolo = YOLO("trained_yolo/weights/best.pt")
yolo = YOLO("new_yolo_febr/weights/best.pt")
yolo.to(device)

# Text OCR
processor_text = TrOCRProcessor.from_pretrained("microsoft/trocr-large-handwritten")
#model_text = VisionEncoderDecoderModel.from_pretrained("trocr_fine_tuned").to(device)
model_text = VisionEncoderDecoderModel.from_pretrained("final_text_trocr").to(device)
# Math OCR
#processor_math = TrOCRProcessor.from_pretrained("microsoft/trocr-base-stage1")
#model_math = VisionEncoderDecoderModel.from_pretrained("./math_trocr_no_normalize").to(device)
model_math = VisionEncoderDecoderModel.from_pretrained("./final_math_trocr").to(device)
processor_math = TrOCRProcessor.from_pretrained("microsoft/trocr-large-handwritten")



def run_trocr(class_name, image):
  """
  Führt OCR mit TrOCR durch, abhängig von der Klasse (Formel oder Text).

  Args:
    class_name: Klassenname ("Formula" oder "Textline")
    image: PIL-Image

  Returns:
    str: Erkanntes Text- oder Formel-Ergebnis
  """
  is_formula = False

  if "Formula" == class_name:
    processor = processor_math
    model = model_math
    is_formula = True
  else:
    processor = processor_text
    model = model_text
    is_formula = False

  pixel = processor(images=image, return_tensors="pt").pixel_values
  pixel = pixel.to(device)

  generated_ids = model.generate(pixel)
  generated_text = processor.batch_decode(generated_ids, skip_special_tokens=True)[0]
  if is_formula:
    #generated_text = generated_text.replace("\\", "\\\\") # Backslashes müssen escaped werden, damit sie in LaTeX korrekt dargestellt werden (z.B. Matrizen)
    generated_text = f"${generated_text}$"
  return generated_text


def mask_overlap(mask1, mask2):
    """
    Überprüft, ob zwei Masken sich vertikal überlappen.
    Die Überlappungbasiert auf einem Schwellenwert, der 30% der durchschnittlichen Höhe der beiden Masken beträgt.
    Args:
    mask1: Dict mit Informationen zur ersten Masken (min_x, max_x, min_y, max_y, avg_y)
    mask2: mit Informationen zur zweiten Masken (min_x, max_x, min_y, max_y, avg_y)
    Returns:
    bool: True, wenn die Masken sich vertikal überlappen, False sonst.
    """
    avg_height = (mask1["max_y"] - mask1["min_y"] + mask2["max_y"] - mask2["min_y"]) / 2
    #threshold = max(50, avg_height * 0.3) # Je nach Höhe der Masken entweder 30% der durchschnittlichen Höhe oder mindestens 50 Pixel Abstand erlauben
    threshold = avg_height * 0.35
    dist = abs(mask1["avg_y"] - mask2["avg_y"])
    #print(f"[{mask1['label']}] avg_y={mask1['avg_y']:.1f} <-> [{mask2['label']}] avg_y={mask2['avg_y']:.1f} | Abstand={distance:.1f}, threshold={threshold:.1f}, avg_height={avg_height:.1f}")

    return dist <= threshold


def sort_rows_and_run_ocr(masks):
    """
    Gruppiert die Masken in Zeilen, sortiert sie und führt OCR aus.overlap_threshold

    Args:
      masks: Liste von Dicts mit den Maskeninformationen.overlap_threshold

    Returns:
      str: Generierter Text aus den erkannten Objekten, gruppiert nach Zeilen
    """
    rows = [] # Liste für Zeilen

    for msk in sorted(masks, key=lambda m: m["min_y"]): # Oberste Maske zuerst
      in_row = False
      for row in rows:
        if any(mask_overlap(msk, other_masks) for other_masks in row):
          row.append(msk)
          in_row = True
          break
      if not in_row: #wenn die Maske in keiner bestehenden Zeile liegt, neue Zeile erstellen
        rows.append([msk])

    for row in rows:
      row.sort(key=lambda msk: msk["min_x"])


    gen_text = ""
    for i, row in enumerate(rows):
      for msk in row:
        gen_text += run_trocr(msk["label"], msk["image"]) + " "
      if i < len(rows) - 1: #Zeilenumbruch nur hinzufügen, wenn es nicht die letzte Zeile ist
        gen_text += "\n\n"

    return gen_text




# Masken-Koordinaten und Polygone zusammenstellen
def prepare_polygons(res):
  """
  Extrahiert Polygone aus den YOLo-Ergebnissen und bereinigt ungültige Geometrien.
  Args:
    res: YOLO-Ergebnisse mit Segmentierungsergebnissen.
  Returns:
    list: Dicts mit 'polygon' und 'class'.
  """
  polygons = []
  for r in res:
    for c in r:
      label = c.names[c.boxes.cls.tolist().pop()]
      contour = c.masks.xy.pop().astype(np.int32) # enthält Punkte der Segmentationsmakse als Array
      poly = Polygon(contour) # Um nacher Berechnungen durchführen zu können
      conf = float(c.boxes.conf.tolist().pop())

      if not poly.is_valid:
        poly = poly.buffer(0) # Entfernt Self Intersections, kann zu MultiPolygons durchführen
      if poly.geom_type == "MultiPolygon":
        poly = max(poly.geoms, key=lambda g: g.area) # Bei MultiPolygon die größte Fläche behalten

      polygons.append({"polygon":poly, "class": label, "conf": conf})

  return polygons

def remove_smaller_polygon(polygons, overlap_threshold=0.8):
    """
    Entfernt kleinere Polygone gleicher Klasse innerhalb größerer Polygone.
    Entfernt zudem auch Polygone anderer Klassen, wenn sie sich stark überlappen und die größere Maske eine höhere Conf. hat.
    Wenn das kleinere Polygon eine andere Klasse hat und eine höhere Conf. als die größere, dann wird
    sie nicht entfernt.

    Args:
      polygons: Liste von Dicts mit 'polygon', 'class', 'conf'
      overlap_threshold: Schwellenwert für Überlappung

    Returns:
      list: Gefilterte Polygone mit optionalem Feld 'inner_polygons'
    """

    clean_sorted_polygons = sorted(polygons, key=lambda p: p["polygon"].area, reverse=True)

    removed = set()
    filtered_polygons = []

    for i, p1 in enumerate(clean_sorted_polygons):
        if i in removed:
            continue

        poly1 = p1["polygon"]
        cls1 = p1["class"]
        conf1 = p1.get("conf", 0.0)

        inner_polygons = []

        for j in range(i + 1, len(clean_sorted_polygons)):
            if j in removed:
                continue

            p2 = clean_sorted_polygons[j]
            poly2 = p2["polygon"]
            cls2 = p2["class"]
            conf2 = p2.get("conf", 0.0)

            if poly2.area == 0:
                continue

            overlap_ratio = poly2.intersection(poly1).area / poly2.area

            if overlap_ratio < overlap_threshold:
                continue

            # gleiche Klasse oder andere Klasse aber höhere Conf, dann entfernen
            if cls1 == cls2 or (cls1 != cls2 and conf1 >= conf2):
                removed.add(j)

            #andere Klasse + inneres Polygon hat höhere Conf
            elif cls1 != cls2 and conf2 > conf1:
                inner_polygons.append({"polygon": poly2,"class": cls2,"conf": conf2})

        filtered_polygons.append({"polygon": poly1,"class": cls1, "conf": conf1,"inner_polygons": inner_polygons})

    return filtered_polygons



def get_segments(mask_crop, inner_polygons, x, min_seg_width=40):
    """
    Teilt die Breite einer Maske in Segmente auf, wenn es innere Polygone gibt.
    Dadurch wird die Lesereihenfolge (links nach rechts) nicht gestört.
    Zudem wird verhindert, dass Segmente ohne Inhalte entstehen.Conf
    Args:
      mask_crop: 2D-Array der Maske des aktuellen Polygons, zugeschnitten auf die Bounding Box.
      inner_polygons: Liste von inneren Polygonen, die sich innerhalb des aktuellen Polygons befinden.
      x: Die x-Koordinate des linken Randes des mask_crop im Originalbild, um die Koordinaten der inneren Polygone relativ zum mask_crop zu berechnen.
      min_seg_width: Mindestbreite eines Segments, damit es als eigenes Segment zurückgegeben wird. Segmente, die kleiner als dieser Wert sind, werden ignoriert,
      um zu verhindern, dass zu schmale Segmente entstehen, die möglicherweise keinen Inhalt haben oder die OCR-Ergebnisse verschlechtern könnten.
    Returns:
      list: Liste von Tupeln mit Start- und Endspalte jedes Segments.
    """
    if not inner_polygons: #Wenn es kein inneres Polygon gibt, gesamte Breite als Segment zurückgeben
        return [(0, mask_crop.shape[1] - 1)] #Tupel mit Start- und Endspalte des Segments, also gesamte Breite

    inner_coords = np.array(list(inner_polygons[0]["polygon"].exterior.coords)) #Koordinaten des inneren Polygons
    inner_min_x = int(inner_coords[:, 0].min()) #Grenzen bestimmen
    inner_max_x = int(inner_coords[:, 0].max())

    rel_inner_min_x = max(0, inner_min_x - x)  # Koordinaten für mask_crop berechnen, indem die x-Koordinate des linken Randes des mask_crop subtrahiert wird
    rel_inner_max_x = min(mask_crop.shape[1] - 1, inner_max_x - x) # Außerdem sicherstellen, dass die Koordinaten innerhalb der Breite des mask_crop liegen

    left_width = rel_inner_min_x # Breite des linken Segments von 0 bis zum inneren Polygon
    right_width = mask_crop.shape[1] - (rel_inner_max_x + 1) # Breite des rechten Segments vom inneren Polygon bis zum Ende der Maske

    segments = []
    if left_width >= min_seg_width:
        segments.append((0, rel_inner_min_x - 1)) # Wenn das linke Segment breit genug ist, als eigenes Segment hinzufügen
    if right_width >= min_seg_width:
        segments.append((rel_inner_max_x + 1, mask_crop.shape[1] - 1))

    return segments or [(0, mask_crop.shape[1] - 1)] #Wenn kein Segment breit genug ist, gesamte Breite als Segment zurückgeben (also ganze Maske)


@app.post("/upload")
async def upload(image: UploadFile = File(...)):
  """
  Empfängt das Bild, führt YOLO-Segmentierung und OCR aus.

  Returns:
      JSON: Generierter Text aus den erkannten Objekten.
  """
  path = upload_dir / image.filename

  # Datei direkt schreiben
  with open(path, "wb") as f:
    content = await image.read()
    f.write(content)

  img = cv2.imread(str(path))
  h,w,_ = img.shape # Auch wichtig für Canvas

  results = yolo.predict(img, conf=0.5, iou=0.7, agnostic_nms=True)  #Bei fast gleichgroßen Masken überlappenden Masken (Klassenunabh.) soll die mit dem größeren Conf. bleiben

  #results = yolo.predict(img)

  objects = []

  polygons = prepare_polygons(results)

  #Kleinere Polygone entfernen, die sich in größeren Polygonen befinden
  m_polygons = remove_smaller_polygon(polygons)

  #m_polygons = polygons  #Testweise alle Polygone behalten, um Vergleich zu haben #

  crop_idx = 0


  for mp in m_polygons:
    poly = mp["polygon"]
    label = mp["class"]
    contour = np.array(list(poly.exterior.coords), np.int32).reshape(-1, 1, 2)
    xy_coords = np.array(list(poly.exterior.coords))
    min_y = xy_coords[:,1].min()
    max_y = xy_coords[:,1].max()
    min_x = xy_coords[:,0].min()
    max_x = xy_coords[:,0].max() # kann eig. weggelassen werden
    avg_y = (min_y + max_y) / 2

    b_mask = np.zeros(img.shape[:2], np.uint8)
    cv2.drawContours(b_mask, [contour], -1, 255, cv2.FILLED)

    kernel_size = 20
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    b_mask = cv2.dilate(b_mask, kernel, iterations=1)

    isolated = np.dstack([img, b_mask]) # Alpha-Kanal hinzufügen

    x, y, w_box, h_box = cv2.boundingRect(contour) # Bounding Box um das Polygon, um den Crop zu beschränken

    img_crop = img[y:y+h_box, x:x+w_box] # Crop auf die Bounding Box beschränken, damit TrOCR nicht zu viel leeren Raum hat
    mask_crop = b_mask[y:y+h_box, x:x+w_box] # Crop der Maske, um die Breite für die Segmentierung zu haben

    segments = get_segments(mask_crop, mp["inner_polygons"], x, min_seg_width=40) # Wenn es innere Polygone gibt, die Breite in Segmente aufteilen, damit TrOCR nicht zu viel leeren Raum hat. Wenn es keine inneren Polygone gibt, wird die gesamte Breite als Segment zurückgegeben

    for seg_start, seg_end in segments: # Da Tupel (start und ende)
        seg_mask = mask_crop[:, seg_start:seg_end + 1] # Segment aus der Maske ausschneiden
        nonzero_rows = np.where(seg_mask.max(axis=1) > 0)[0]
        if nonzero_rows.size == 0:
            continue

        seg_top, seg_bottom = nonzero_rows[0], nonzero_rows[-1] #Höhe des Segments bestimmen

        seg_img = img_crop[seg_top:seg_bottom + 1, seg_start:seg_end + 1] # Segment aus dem Bild ausschneiden
        seg_mask = seg_mask[seg_top:seg_bottom + 1] # Segment aus der Maske zuschneiden, damit er die Höhe für den Crop hat

        img_ocr = seg_img.copy()
        img_ocr[seg_mask == 0] = 255 # Alle Pixel außerhalb des Segments auf weiß setzen, damit TrOCR nicht durch leeren Raum verwirrt wird

        # Testweise nur Boxen
        #img_ocr = Image.fromarray(cv2.cvtColor(img_crop, cv2.COLOR_BGR2RGB)) #

        # Crop speichern, als Zwischenschritt, um zu sehen, was TrOCR bekommt
        save_subdir = save_dir_text if label != "Formula" else save_dir_formula
        file_stem = Path(image.filename).stem
        crop_name = f"{file_stem}_{label}_{crop_idx}.png" #
        cv2.imwrite(str(save_subdir / crop_name), img_ocr)
        crop_idx += 1

        objects.append({"label": label,"min_x": x + seg_start,"max_x": x + seg_end,"min_y": y + seg_top,"max_y": y + seg_bottom,
        "avg_y": (y + seg_top + y + seg_bottom) / 2,"image": img_ocr})


  gen_text = sort_rows_and_run_ocr(objects)

  #gen_text = ""
  #for ob in objects:  # Testweise ohne Sortierung
  #    gen_text += run_trocr(ob["label"], ob["image"])
  #    gen_text += "\n\n"

  txt_path = output_dir_box / f"{Path(image.filename).stem}.txt"

  with open(txt_path, "w", encoding="utf-8") as f:
    f.write(gen_text.replace("\n\n", "\n"))

  #print("Object-Output: ", output )
  return gen_text



if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
