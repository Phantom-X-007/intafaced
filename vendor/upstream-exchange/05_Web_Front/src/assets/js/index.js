const $ = require('jquery');
exports = module.exports = { 
    scrollFunction:function(){ 
        var aNav = $('#nav ul li a'); //navigation
        var aDiv = $('.section'); //section
            $(window).scroll(function() {
                        var winH = $(window).height();
                        var iTop = $(window).scrollTop();

                        if(iTop >= $(".layout").height()) {
                            aDiv.each(function() {
                                //console.log($(this).offset().top);
                                if(winH + iTop - $(this).offset().top > winH / 2) {
                                    //console.log(aNav);
                                    aNav.removeClass('active');
                                    //console.log(aNav);
                                    aNav.siblings().hide();
                                    aNav.eq($(this).index()).addClass('active');
                                    aNav.eq($(this).index()).siblings().show();
                                    
                                    $(".fadeinB").css('animation',"");
                                    $(".fadeinA").css('animation',"");
                                    if($(this).index()=='2'){
                                        $(".fadeinB").css('animation',"fadeinB 3s");
                                        $(".fadeinA").css('animation',"fadeinA 3s");
                                    }
                                    if($(this).index()=='3'){
                                        $(".fadeinB").css('animation',"fadeinB 3s");
                                        $(".fadeinA").css('animation',"fadeinA 3s");
                                    }
                                }
                            })
                        }
                        })
            $('#nav ul li a').click(function(){
                $(this).siblings('span').show().parent().siblings().children('span').hide();
                $(this).addClass('active').parent().siblings().children('a').removeClass('active');
            })
    }
}