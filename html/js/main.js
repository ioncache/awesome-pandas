function show_view(view) {
    $(".view").fadeOut(200);
    $(".menu_item").removeClass("active");
    setTimeout(function() {
        $("#" + view).fadeIn(200);
        $("#" + view + "_page").addClass('active');
    }, 200);
}

