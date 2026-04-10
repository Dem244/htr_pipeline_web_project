import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import {getAuth, provideAuth} from '@angular/fire/auth';
import {getFirestore, provideFirestore} from '@angular/fire/firestore';
//import { getAnalytics } from "firebase/analytics";
import {provideFirebaseApp} from '@angular/fire/app';
import {initializeApp} from 'firebase/app';
import {provideHttpClient} from '@angular/common/http';
import {routes} from './app/app.routes';
import {provideRouter} from '@angular/router';
import {registerLocaleData} from '@angular/common';
import localeDe from '@angular/common/locales/de';
import {firebaseConfig} from './enviroments/enviroments';
import {getStorage, provideStorage} from '@angular/fire/storage';


registerLocaleData(localeDe);




// Initialize Firebase
//const app = initializeApp(firebaseConfig);
//const analytics = getAnalytics(app);

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideFirebaseApp(() => initializeApp(firebaseConfig)),
    provideAuth(() => getAuth()),
    provideFirestore(() => getFirestore()),
    provideHttpClient(),
    provideStorage(() => getStorage())
  ]
}).catch(err => console.error(err));
