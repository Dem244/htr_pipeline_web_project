#https://www.reddit.com/r/Rag/comments/1glr3gj/error_withtiktoken_when_using_sentencetransformer/
#https://stackoverflow.com/questions/58435218/intersection-over-union-on-non-rectangular-quadrilaterals
#https://docs.ultralytics.com/guides/isolating-segmentation-objects/#isolate-with-black-pixels-sub-options
#https://stackoverflow.com/questions/1342601/pythonic-way-of-checking-if-a-condition-holds-for-any-element-of-a-list (für rows)
from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from ultralytics import YOLO
import os
import torch
import cv2
import numpy as np
from shapely.geometry import Polygon, MultiPolygon
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

device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu") # Ggf. ausschalten (manchmal CUDA Probleme)

print(f"GPU use: {torch.cuda.is_available()}")

upload_dir = Path("uploads")
upload_dir.mkdir(exist_ok=True)
output_dir = Path("outputs")
output_dir.mkdir(exist_ok=True)
output_dir_box = Path("outputs_box_text") # Generierter Text (boxbasiert)
output_dir_box.mkdir(exist_ok=True)
output_dir_mask = Path("outputs_mask_text") # Generierter Text (boxbasiert)
output_dir_mask.mkdir(exist_ok=True)
save_dir_text = Path("text_crops")
save_dir_text.mkdir(exist_ok=True)
save_dir_formula = Path("formula_crops")
save_dir_formula.mkdir(exist_ok=True)

os.makedirs(upload_dir, exist_ok=True)
os.makedirs(output_dir, exist_ok=True)


#yolo = YOLO("trained_yolo/weights/best.pt")
yolo = YOLO("new_yolo_febr/weights/best.pt")
yolo.to(device)

# Text OCR
processor_text = TrOCRProcessor.from_pretrained("microsoft/trocr-large-handwritten")
#model_text = VisionEncoderDecoderModel.from_pretrained("trocr_fine_tuned").to(device)
model_text = VisionEncoderDecoderModel.from_pretrained("final_text_trocr").to(device)
# Math OCR
processor_math = TrOCRProcessor.from_pretrained("microsoft/trocr-large-stage1")
model_math = VisionEncoderDecoderModel.from_pretrained(r"E:\math_trocr_hme_and_mathwriting").to(device)
#model_math = VisionEncoderDecoderModel.from_pretrained("./final_math_trocr").to(device)
#processor_math = TrOCRProcessor.from_pretrained("microsoft/trocr-large-handwritten")



def run_trocr(class_name, image):
  """
  Führt OCR mit TrOCR durch, abhängig von der Klasse (Formel oder Text).

  Args:
    class_name: Klassenname ("Formula" oder "Textline")
    image: Bild, auf dem Texterkennung durchgeführt werden soll

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


def prepare_detections(results):
    """
    Bereitet die YOLO-Ergebnisse auf, indem sie die Bounding-Box-Koordinaten mit den Polygon-Koordinaten der Maske kombiniert.
    args:
    results: YOLO-Ergebnisse mit Boxen und Masken
    returns:
    Liste von Dicts mit den kombinierten Informationen
    """
    boxes_out = []

    for r in results:
        boxes = r.boxes
        if boxes is None:
            continue

        for i in range(len(boxes)): #Über alle Detektionen iterieren
            cls_id = int(boxes.cls[i].item()) #Klassen der Detections
            label = r.names[cls_id]
            conf = float(boxes.conf[i].item()) #Wichtig für die Entscheidung, welche Detection bei Überlappung behalten wird

            orig_x1 = int(boxes.xyxy[i][0].item()) #int notwendig, weil nachher img[y1:y2, x1:x2]
            orig_y1 = int(boxes.xyxy[i][1].item())
            orig_x2 = int(boxes.xyxy[i][2].item())
            orig_y2 = int(boxes.xyxy[i][3].item())

            polygon = Polygon(r.masks.xy[i])
            if not polygon.is_valid: # Manchmal können die Polygone ungültig sein (z.B. Self Intersections), daher mit buffer reparieren
              polygon = polygon.buffer(0) # Entfernt Self Intersections, kann zu MultiPolygons durchführen
            if polygon.geom_type == "MultiPolygon":
              polygon = max(polygon.geoms, key=lambda g: g.area)

            _, poly_y1, _, poly_y2 = map(int, polygon.bounds) # Bounds liefert x_min, etc. vom Polygon

            #X von originaler Box, Y vom Polygon
            x1 = orig_x1
            x2 = orig_x2
            y1 = poly_y1
            y2 = poly_y2

            # Mitgabe der originalen Box-Koordinaten, damit nacher ein Vergleich zwischen Masken und Boxen möglich ist (sonst werden Boxen auf die Größe der Maske reduziert)
            boxes_out.append({"min_x": x1,"min_y": y1,"max_x": x2, "max_y": y2, "avg_y": (y1 + y2) / 2,
                "class": label, "conf": conf, "polygon": polygon, "orig_min_x": orig_x1,
                "orig_min_y": orig_y1, "orig_max_x": orig_x2, "orig_max_y": orig_y2
            })

    return boxes_out

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
      in_row = False #Statusvariable, ob die aktuelle Maske bereits einer Zeile zugeordnet wurde
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






# https://docs.ultralytics.com/guides/isolating-segmentation-objects/#full-example-code
def isolate_mask_in_box(img, box, show_mask=True):
    """
      Isoliert die Maske innerhalb der Box, indem sie die Pixel außerhalb der Maske weiß färbt.
      Args:
      img: Bild als NumPy-Array
      box: Dict mit Informationen zur Box und Maske
      show_mask: Bool, ob die Maske angezeigt werden soll (True) oder nur der Box-Crop (False)
      Returns:
      result: Bildausschnitt mit isolierter Maske oder Box-Crop
    """
    x1, y1, x2, y2 = box["min_x"], box["min_y"], box["max_x"], box["max_y"]
    img_crop = img[y1:y2, x1:x2].copy()

    if not show_mask:
        return img_crop

    b_mask = np.zeros(img.shape[:2], dtype=np.uint8) # erstellt eine leere schwarze Maske in der Größe des Originalbildes

    contour = np.array(box["polygon"].exterior.coords, dtype=np.int32).reshape(-1, 1, 2)
    cv2.drawContours(b_mask, [contour], -1, 255, cv2.FILLED) #zeichnet die Kontur des Polygons auf die Maske, gefüllt mit weiß (255)

    # Maske etwas erweitern, damit auch bspw. bei Formeln die Ränder mit erfasst werden (z.B. Brüche, Wurzeln, etc.)
    kernel_size = 20
    kernel = np.ones((kernel_size, kernel_size), np.uint8)
    b_mask = cv2.dilate(b_mask, kernel, iterations=1)

    mask_crop = b_mask[y1:y2, x1:x2]

    result = np.full_like(img_crop, 255) #erstellt ein neues Bild mit der gleichen Größe wie der Crop, gefüllt mit weißen Pixeln
    result[mask_crop > 0] = img_crop[mask_crop > 0] #kopiert die Pixel aus dem Crop in das Ergebnis, aber nur dort, wo die Maske weiß ist (mask_crop > 0)

    return result

def remove_smaller_detection(polygons, overlap_threshold=0.8):
    """
    Entfernt kleinere Detectionen polygonbasiert.

    Gleiche Klasse:
      - kleinere Detection innerhalb größerer Detection wird entfernt

    Andere Klasse:
      - wenn größere Detection höhere oder gleiche Conf hat, wird die kleinere entfernt
      - wenn kleinere Detection höhere Conf hat, bleibt sie als inner_polygon erhalten
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

            overlap_ratio = poly2.intersection(poly1).area / poly2.area

            if overlap_ratio < overlap_threshold:
                continue

            if cls1 == cls2 or (cls1 != cls2 and conf1 >= conf2):
                removed.add(j)
            elif cls1 != cls2 and conf2 > conf1:
                inner_polygons.append({"polygon": poly2,"class": cls2,"conf": conf2,
                    "min_x": p2["min_x"],"min_y": p2["min_y"],"max_x": p2["max_x"],"max_y": p2["max_y"],"avg_y": p2["avg_y"]})

        min_x, min_y, max_x, max_y = map(int, poly1.bounds)
        # Originale Box-Koordinaten beibehalten, für den Vergleich zwischen Masken und Boxen
        filtered_polygons.append({"polygon": poly1,"class": cls1, "conf": conf1, "min_x": p1["min_x"],
                    "min_y": p1["min_y"], "max_x": p1["max_x"], "max_y": p1["max_y"], "avg_y": p1["avg_y"], "orig_min_x": p1["orig_min_x"],
                    "orig_min_y": p1["orig_min_y"], "orig_max_x": p1["orig_max_x"], "orig_max_y": p1["orig_max_y"], "inner_polygons": inner_polygons
                })

    return filtered_polygons


def get_segments_from_polygons(mask_crop_width, inner_polygons, x, min_seg_width=40):
    if not inner_polygons:
        return [(0, mask_crop_width - 1)]

    inner_poly = inner_polygons[0]
    inner_min_x = inner_poly["min_x"]
    inner_max_x = inner_poly["max_x"]

    rel_inner_min_x = max(0, inner_min_x - x)
    rel_inner_max_x = min(mask_crop_width - 1, inner_max_x - x)

    left_width = rel_inner_min_x
    right_width = mask_crop_width - (rel_inner_max_x + 1)

    segments = []
    if left_width >= min_seg_width:
        segments.append((0, rel_inner_min_x - 1))
    if right_width >= min_seg_width:
        segments.append((rel_inner_max_x + 1, mask_crop_width - 1))

    return segments or [(0, mask_crop_width - 1)]

@app.post("/upload")
async def upload(image: UploadFile = File(...)):
    path = upload_dir / image.filename

    with open(path, "wb") as f:
        content = await image.read()
        f.write(content)

    img = cv2.imread(str(path))

    img_h, img_w = img.shape[:2]

    results = yolo.predict(img, conf=0.5, iou=0.7, agnostic_nms=True)

    objects = []
    detections = prepare_detections(results)
    filtered_detections = remove_smaller_detection(detections)

    crop_idx = 0

    for det in filtered_detections:
        label = det["class"]

        x1 = max(0, det["min_x"])
        y1 = max(0, det["min_y"])
        x2 = min(img_w, det["max_x"])
        y2 = min(img_h, det["max_y"])

        if x2 <= x1 or y2 <= y1: #Ungültige Detection, überspringen
            continue

        img_crop = isolate_mask_in_box(img, det, show_mask=True) #Steuern zwischen Box-Crop und Masken-Crop
        crop_w = img_crop.shape[1]

        segments = get_segments_from_polygons(crop_w, det["inner_polygons"], x1, min_seg_width=50)

        for seg_start, seg_end in segments:

            seg_img = img_crop[:, seg_start:seg_end + 1] # Bereich des Crops entsprechend der Segmentierung zuschneiden

            # vertikal leere Ränder anhand des Bildinhalts reduzieren
            gray = cv2.cvtColor(seg_img, cv2.COLOR_BGR2GRAY)
            nonwhite_rows = np.where(np.min(gray, axis=1) < 250)[0] #Zeilen, die nicht komplett weiß sind

            if nonwhite_rows.size == 0:
                continue

            seg_top, seg_bottom = nonwhite_rows[0], nonwhite_rows[-1] #erste und letzte Zeile, die nicht komplett weiß ist
            seg_img = seg_img[seg_top:seg_bottom + 1] #vertikal auf den Bereich zuschneiden, der Inhalt hat

            # Crops speichern für Debugging-Zwecke
            save_subdir = save_dir_text if label != "Formula" else save_dir_formula
            file_stem = Path(image.filename).stem
            crop_name = f"{file_stem}_{label}_{crop_idx}.png"
            cv2.imwrite(str(save_subdir / crop_name), seg_img)
            crop_idx += 1

            abs_min_x = x1 + seg_start # Koordinaten des Segments im Originalbild berechnen, damit später die Zeilen korrekt sortiert werden können
            abs_max_x = x1 + seg_end
            abs_min_y = y1 + seg_top
            abs_max_y = y1 + seg_bottom

            objects.append({ "label": label, "min_x": abs_min_x, "max_x": abs_max_x, "min_y": abs_min_y,
                "max_y": abs_max_y, "avg_y": (abs_min_y + abs_max_y) / 2, "image": seg_img
            })

    gen_text = sort_rows_and_run_ocr(objects) #Generierten Text in Zeilen sortieren und OCR durchführen

    txt_path = output_dir_mask / f"{Path(image.filename).stem}.txt" #Für die Evaluierung der gesamten Pipeline (Masken) wird der Text gespeichert

    with open(txt_path, "w", encoding="utf-8") as f:
      f.write(gen_text.replace("\n\n", "\n"))

    #txt_path = output_dir_box / f"{Path(image.filename).stem}.txt"

    #with open(txt_path, "w", encoding="utf-8") as f:
    #    f.write(gen_text.replace("\n\n", "\n"))

    return gen_text




if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=5000)
