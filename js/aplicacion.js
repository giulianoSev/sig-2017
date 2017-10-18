require([
    "esri/Map",
    "esri/layers/TileLayer",
    "esri/views/MapView",
    "esri/Graphic",
    "esri/layers/GraphicsLayer",
    "esri/tasks/RouteTask",
    "esri/tasks/support/RouteParameters",
    "esri/tasks/support/FeatureSet",
    "esri/core/urlUtils",
    "dojo/on",
    "esri/widgets/Search",
    "esri/tasks/Locator",
    "dojo/domReady!"
], function(
    Map, TileLayer, MapView, Graphic, GraphicsLayer, RouteTask, RouteParameters,
    FeatureSet, urlUtils, on, Search, Locator
) {
    ///////////////////////////
    // DEFINICIONES Y CONSTANTES
    //////////////////////////

    var token = null;
    var stops = [];
    var stopMarker = {
        type: "simple-marker",
        color: [226, 119, 40],
        outline: {
          color: [255, 255, 255],
          width: 2
        }
    };

    ///////////////////////////
    // AUTENTICACIÓN
    //////////////////////////

    $.ajax({
        type: "POST", 
        url: "https://www.arcgis.com/sharing/rest/oauth2/token/", 
        data: {client_id: "flL9d1hXjmPLIyzM", client_secret: "6cefd5ea7de8479f98bebbb9081db0d3", grant_type: "client_credentials"}, 
        dataType: 'json', 
        async: false,
        success: (arcgis_token) => {
            console.log(arcgis_token);
            token = arcgis_token;
        },
        error: () => {
            alert("Error al obtener el token.");
        }
    });

    ///////////////////////////
    // INIT
    //////////////////////////

    // Se crea y carga el mapa
    var tiled_map = new TileLayer("http://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer");
    var map = new Map({layers: [tiled_map]});
    var view = new MapView({container: "viewDiv", zoom: 4, center: [-95,39], map: map});

    // Se deja definida la capa de rutas
    var routeLyr = new GraphicsLayer();
    map.layers.add(routeLyr);
    



    ///////////////////////////
    // WIDGETS
    //////////////////////////

    // BÚSQUEDA
    var searchWidget = new Search({
        view: view, 
        sources: [{
            locator: new Locator({ url: "//geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer" }),
            singleLineFieldName: "SingleLine",
            placeholder: "Buscar direcciones en EEUU",
            countryCode: "US"
        }]
    });
    view.ui.add(searchWidget, {position: "top-left", index: 0});


    ///////////////////////////
    // EVENTOS
    //////////////////////////

    // BUSQUEDA: Evento resultado seleccionado
    // Se agrega la coordenada a las paradas
    searchWidget.on("select-result", (result) => {
        var stop = {
            name: result.result.name,
            geometry: result.result.feature.geometry,
            symbol: stopMarker,
            graphic: new Graphic({geometry: result.result.feature.geometry, symbol: stopMarker})
        };
        addStop(stop);
        solveRoute();
    });



    ///////////////////////////
    // AUXILIARES JS
    //////////////////////////

    // Agrega una parada y su punto en el mapa
    function addStop(stop){
        // Establece el id
        stop.id = stops.length + 1;

        // Agrega al mapa
        view.graphics.addMany([stop.graphic]);

        stops.push(stop);

        // Cambios en View
        updateStopsList();
    }

    // Quita una parada y su punto en el mapa
    function removeStop(stopId){
        debugger;
        var stop = _.find(stops, s => s.id == stopId);
        stops = _.without(stops, stop);

        view.graphics.remove(stop.graphic);
        for(var i = 0; i < stops.length; i++){
            if(stops[i].id != i){
                stops[i].id = i;
            }
        }

        // Quito la ruta 
        routeLyr.removeAll();

        // Cambios en View
        updateStopsList();
    }

    // Resuleve la ruta
    function solveRoute(){
        var routeParams = new RouteParameters({
            stops: new FeatureSet(),
            outSpatialReference: {wkid: 3857}
        });

        stops.forEach(stop => {
            routeParams.stops.features.push(stop.graphic);
        });

        if(routeParams.stops.features.length < 2){
            alert("Tiene que haber 2 o más paradas.");
            return;
        }

        (new RouteTask({
            url: `https://route.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World?token=${token.access_token}`
        }))
        .solve(routeParams)
        .then((data) => {
            var routeResult = data.routeResults[0].route;
            routeResult.symbol = {
                type: "simple-line",
                color: [0, 0, 255, 0.5],
                width: 5
            };
            routeLyr.removeAll();
            routeLyr.add(routeResult);
        })
        .catch(() => {
            alert("Ocurrió un error al calcular la ruta");
        })
    }


    ///////////////////////////
    // AUXILIARES HTML
    //////////////////////////

    // Agrega parada a lista de paradas
    function addStopHtml(stop){
        $("#stopList").append(`<li id="stopListItem${stop.id}" onclick="removeStop(${stop.id})">${stop.name}</li>`);
        $("#stopListItem" + stop.id).click(() => {
            removeStop(stop.id);    
        });
    }

    // Actualiza la lista de paradas
    function updateStopsList(){
        $("#stopList").html("");
        stops.forEach(stop => {
            addStopHtml(stop);
        });
    }

});