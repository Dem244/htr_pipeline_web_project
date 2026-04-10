import { ComponentFixture, TestBed } from '@angular/core/testing';

import { MaskEditorComponent } from './mask-editor.component';

describe('MaskEditorComponent', () => {
  let component: MaskEditorComponent;
  let fixture: ComponentFixture<MaskEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MaskEditorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(MaskEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
