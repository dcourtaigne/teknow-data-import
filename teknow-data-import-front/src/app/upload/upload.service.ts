import { Injectable } from '@angular/core'
import {
  HttpClient,
  HttpRequest,
  HttpEventType,
  HttpResponse,
  HttpHeaders 
} from '@angular/common/http'

import { Observable } from 'rxjs'
import {Subject} from 'rxjs';

const urlUpload = 'http://localhost:3000/upload'
const urlTable = 'http://localhost:3000/tables'

@Injectable()
export class UploadService {
  constructor(private http: HttpClient) {}

  public upload(files: Set<File>):
    { [key: string]: { progress: Observable<number> } } {

    // this will be the our resulting map
    const status: { [key: string]: { progress: Observable<number> } } = {};

    files.forEach(file => {
      // create a new multipart-form for every file
      const formData: FormData = new FormData();
      formData.append('file', file, file.name);

      // create a http-post request and pass the form
      // tell it to report the upload progress
      const req = new HttpRequest('POST', urlUpload, formData, {
        reportProgress: true
      });

      // create a new progress-subject for every file
      const progress = new Subject<any>();

      // send the http-request and subscribe for progress-updates
      this.http.request(req).subscribe(event => {
        if (event.type === HttpEventType.UploadProgress) {

          // calculate the progress percentage
          const percentDone = Math.round(100 * event.loaded / event.total);

          // pass the percentage into the progress-stream
          progress.next(percentDone);
        } else if (event instanceof HttpResponse) {


          console.log(event.body);
          // Close the progress-stream if we get an answer form the API
          // The upload is complete
          progress.next(event.body);
          //return event.body;
          
          progress.complete();
          
          
        }
      });

      // Save every progress-observable in a map of all observables
      status[file.name] = {
        progress: progress.asObservable()
      };
    });

    // return the map of progress.observables
    return status;
  }
  
  public postTableData(body){
    console.log(body)
    let headers = new HttpHeaders().set('Content-Type', 'application/json');
    return this.http.post<any>(urlTable,body, {headers: headers})
  }
}