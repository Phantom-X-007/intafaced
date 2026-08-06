/** 
 * html5, .
 */ 
var ImageResizer=function(opts){ 
    var settings={ 
        resizeMode:"auto"//compression mode: auto | width | height. auto scales proportionally by whichever of width/height is larger; width and height scale by that dimension alone. 
,dataSource:"" //source to compress: an image element, a base64 string, a canvas, or a File from a picker. 
,dataSourceType:"image" //image base64 canvas 
,maxWidth:298 //maximum allowed width 
,maxHeight:200 //maximum allowed height. 
,onTmpImgGenerate:function(img){} //called when the intermediate image is produced; do not mutate that image or the compressed result will be wrong. 
,success:function(resizeImgBase64,canvas){ 
  
        }//base64 string of the compressed image. 
,debug:false //whether to enable debug mode. 
  
    }; 
    var appData={}; 
    $.extend(settings,opts); 
  
    var _debug=function(str,styles){ 
        if(settings.debug==true){ 
            if(styles){ 
                console.log(str,styles); 
            } 
            else{ 
                console.log(str); 
            } 
        } 
    }; 
var innerTools={ 
        getBase4FromImgFile:function(file,callBack){ 
  
            var reader = new FileReader(); 
            reader.onload = function(e) { 
                var base64Img= e.target.result; 
                //var $img = $('<img>').attr("src", e.target.result) 
                //$('#preview').empty().append($img) 
                if(callBack){ 
                    callBack(base64Img); 
                } 
            }; 
            reader.readAsDataURL(file); 
        } 
  
    // .... , .
,getImgFromDataSource:function(datasource,dataSourceType,callback){ 
            var _me=this; 
            var img1=new Image(); 
            if(dataSourceType=="img"||dataSourceType=="image"){ 
            img1.src=$(datasource).attr("src"); 
            if(callback){ 
             callback(img1); 
            } 
            } 
            else if(dataSourceType=="base64"){ 
                img1.src=datasource; 
            if(callback){ 
             callback(img1); 
            } } 
            else if(dataSourceType=="canvas"){ 
            img1.src = datasource.toDataURL("image/jpeg"); 
            if(callback){ 
             callback(img1); 
            } 
            } 
            else if(dataSourceType=="file"){ 
                _me.getBase4FromImgFile(function(base64str){ 
                    img1.src=base64str; 
                    if(callback){ 
                        callback(img1); 
                    } 
                }); 
            } 
  
        } 
       // . , , setting.
,getResizeSizeFromImg:function(img){ 
       var _img_info={ 
                w:$(img)[0].naturalWidth, 
                h:$(img)[0].naturalHeight 
            }; 
        console.log("Actual size:"); 
        console.log(_img_info); 
       var _resize_info={ 
           w:0 
,h:0 
       }; 
        if(_img_info.w<=settings.maxWidth&&_img_info.h<=settings.maxHeight){ 
            return _img_info; 
        } 
        if(settings.resizeMode=="auto"){ 
        var _percent_scale=parseFloat(_img_info.w/_img_info.h); 
            var _size1={ 
                w:0 
,h:0 
            }; 
            var _size_by_mw={ 
                w:settings.maxWidth 
,h:parseInt(settings.maxWidth/_percent_scale) 
            }; 
            var _size_by_mh={ 
                w:parseInt(settings.maxHeight*_percent_scale) 
,h:settings.maxHeight 
            }; 
            if(_size_by_mw.h<=settings.maxHeight){ 
                return _size_by_mw; 
            } 
            if(_size_by_mh.w<=settings.maxWidth){ 
                return _size_by_mh; 
            } 
  
            return { 
                w:settings.maxWidth 
,h:settings.maxHeight 
            }; 
  
        } 
        if(settings.resizeMode=="width"){ 
            if(_img_info.w<=settings.maxWidth){ 
                return _img_info; 
            } 
            var _size_by_mw={ 
                w:settings.maxWidth 
,h:parseInt(settings.maxWidth/_percent_scale) 
            }; 
            return _size_by_mw; 
        } 
  
        if(settings.resizeMode=="height"){ 
            if(_img_info.h<=settings.maxHeight){ 
  
                return _img_info; 
            } 
            var _size_by_mh={ 
                w:parseInt(settings.maxHeight*_percent_scale) 
,h:settings.maxHeight 
            }; 
            return _size_by_mh; 
        } 
  
    } 
    // canvas.
,drawToCanvas:function(img,theW,theH,realW,realH,callback){ 
  
    var canvas = document.createElement("canvas"); 
        canvas.width=theW; 
        canvas.height=theH; 
        var ctx = canvas.getContext('2d'); 
        ctx.drawImage(img, 
0,//sourceX, 
0,//sourceY, 
realW,//sourceWidth, 
realH,//sourceHeight, 
0,//destX, 
0,//destY, 
theW,//destWidth, 
theH//destHeight 
); 
  
        // base64canvassuccess.
        var base64str=canvas.toDataURL("image/jpeg"); 
        if(callback){ 
            callback(base64str,canvas); 
        } 
    } 
    }; 
  
    // .
    (function(){ 
        innerTools.getImgFromDataSource(settings.dataSource,settings.dataSourceType,function(_tmp_img){ 

            setTimeout(function(){
                var __tmpImg=_tmp_img; 
                settings.onTmpImgGenerate(_tmp_img); 
                // .
                var _limitSizeInfo=innerTools.getResizeSizeFromImg(__tmpImg); 
                console.log(_limitSizeInfo); 
                var _img_info={ 
                    w:$(__tmpImg)[0].naturalWidth, 
                    h:$(__tmpImg)[0].naturalHeight 
                }; 
            
                innerTools.drawToCanvas(__tmpImg,_limitSizeInfo.w,_limitSizeInfo.h,_img_info.w,_img_info.h,function(base64str,canvas){ 
                  settings.success(base64str,canvas); 
                }); 
            },1000);
             
  
        }); 
    })(); 
  
    var returnObject={ 
  
  
    }; 
  
    return returnObject; 
}; 