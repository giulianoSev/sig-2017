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
    "esri/layers/FeatureLayer",
    "esri/widgets/Print",
    "esri/widgets/Print/PrintViewModel",
    "esri/tasks/support/PrintTemplate",
    "esri/tasks/support/Query",
    "esri/tasks/GeometryService",
    "esri/tasks/support/DensifyParameters",
    "esri/config",
    "dojo/domReady!"
], function(
    Map, TileLayer, MapView, Graphic, GraphicsLayer, RouteTask, RouteParameters,
    FeatureSet, urlUtils, on, Search, Locator, FeatureLayer, Print, PrintVM, PrintTemplate, Query, GeometryService,
    DensifyParameters, esriConfig
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
    var routeSymbol = {
        type: "simple-line",
        color: [0, 0, 255, 0.5],
        width: 5
    };
    var carSymbol = {
        type: "picture-marker",
        url: "assets/car.png",
        width: "40px",
        height: "40px"
    };
    var simulating = false;

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
    var view = new MapView({
        container: "viewDiv", 
        zoom: 4, 
        center: [-95,39], 
        spatialReference: { wkid: 102100 },
        map: map
    });

    
    // Se deja definida la capa de rutas
    var routeLyr = new GraphicsLayer();
    map.layers.add(routeLyr);
    var current_route = null;

    // Se deja definida la capa del móvil
    var mobileLyr = new GraphicsLayer();
    map.layers.add(mobileLyr);

    // Se define la feature layer para guardar las paradas como eventos
    var stopsFLyr = new FeatureLayer({
        url: "http://sampleserver5.arcgisonline.com/arcgis/rest/services/LocalGovernment/Events/FeatureServer/0",
        outFields: ["*"],
        visible: false,
        spatialReference: { wkid: 102100 }
    });
    map.layers.add(stopsFLyr);

    // Se define la feature layer para guardar las rutas como trails
    var routesFLyr = new FeatureLayer({
        url: "http://sampleserver5.arcgisonline.com/arcgis/rest/services/LocalGovernment/Recreation/FeatureServer/1",
        outFields: ["*"],
        visible: false,
        spatialReference: { wkid: 102100 },
    });
    map.layers.add(routesFLyr);

    // Se define el proxy
    // esriConfig.request.corsEnabledServers.push("tasks.arcgisonline.com");
    // esriConfig.request.proxyUrl = "/proxy/";

    // Se define el servicio para operaciones espaciales
    var geometrySvc = new GeometryService({url: "https://sampleserver6.arcgisonline.com/arcgis/rest/services/Utilities/Geometry/GeometryServer"});

    // Init Eventos Javascript
    initDocument();

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


    // EXPORTAR A PDF
    var printWidget = new Print({
        viewModel: new PrintVM({
            view: view,
            url: "https://sampleserver6.arcgisonline.com/arcgis/rest/services/Utilities/PrintingTools/GPServer/Export%20Web%20Map%20Task"
        }),
    });


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
            graphic: new Graphic({
                geometry: result.result.feature.geometry, 
                symbol: stopMarker, 
                // Atributos para el servidor de eventos
                attributes: {
                    event_type: "17", 
                    description: result.result.name
                }
            })
        };
        addStop(stop);
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
        current_route = null;

        // Cambios en View
        updateStopsList();
    }

    // Resuleve la ruta
    function solveRoute(){
        var routeParams = new RouteParameters({
            stops: new FeatureSet(),
            outSpatialReference: { wkid: 102100 }
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
            routeResult.symbol = routeSymbol;
            routeLyr.removeAll();
            routeLyr.add(routeResult);

            current_route = routeResult;
        })
        .catch(() => {
            alert("Ocurrió un error al calcular la ruta");
        })
    }

    // Guarda las paradas en el feature server
    function saveStops(){
        var adds = [];
        stops.forEach(stop => {
            adds.push(stop.graphic);
        });
        stopsFLyr.applyEdits({
            addFeatures: adds
        })
        .then(() => {
            alert("Guardado!");
        })
        .catch(() => {
            alert("Error!");
        });
    }

    // Carga las paradas desde el feature server
    function loadStops(){
        var query = new Query();
        query.where = "event_type = '17'";
        query.returnGeometry = true;
        query.outSpatialReference = { wkid: 102100 };
        stopsFLyr.queryFeatures(query)
        .then((featureSet) => {
            console.log(featureSet);
            if(featureSet.features.length < 1){
                alert("No hay paradas guardadas.");
                return;
            }

            featureSet.features.forEach(feature => {
                var stop = {
                    name: feature.attributes.description,
                    geometry: feature.geometry,
                    symbol: stopMarker,
                    graphic: new Graphic({
                        geometry: feature.geometry, 
                        symbol: stopMarker, 
                        // Atributos para el servidor de eventos
                        attributes: {
                            event_type: "17", 
                            description: feature.attributes.description
                        }
                    })
                };

                addStop(stop);
            });
        })
        .catch(err => {
            alert("Ocurrió un error cargando las paradas");
        });
    }

    // Guarda la ruta en el feature server
    function saveRoute(){
        if(current_route){
            // Pregunto por nombre para guardarlo
            var name = window.prompt("Nombre de la ruta", "");
            if(!name){
                return;
            }
            if(isNullOrWhitespace(name) || !isAlphanumeric(name)){
                alert(`"${name}" es un nombre inválido para la ruta.`);
                return;
            }
            var route_graphic = new Graphic({
                geometry: current_route.geometry,
                symbol: routeSymbol,
                attributes: {
                    trailtype: 4,
                    notes: "sig_grupo7_" + name
                }
            });
            routesFLyr.applyEdits({
                addFeatures: [route_graphic]
            })
            .then(() => {
                alert("Ruta guardada!");
            })
            .catch(() => {
                alert("Error al guardar ruta.");
            });
        }else{
            alert("Debe haber una ruta cargada para guardar.");
        }
    }

    // Carga una ruta seleccionada desde el feature server
    function loadRoute(){
        var name = window.prompt("Nombre de la ruta", "");
        if(!name){
            return;
        }
        if(isNullOrWhitespace(name) || !isAlphanumeric(name)){
            alert(`"${name}" es un nombre inválido para la ruta.`);
            return;
        }

        var query = new Query();
        query.where = `notes = 'sig_grupo7_${name}'`;
        query.returnGeometry = true;
        query.outSpatialReference = { wkid: 102100 };
        
        routesFLyr.queryFeatures(query)
        .then(featureSet =>{
            debugger;

            var routeResult = {
                geometry: featureSet.features[0].geometry,
                symbol: routeSymbol
            };
            routeLyr.removeAll();
            routeLyr.add(routeResult);

            current_route = routeResult;
        })
        .catch (err => {
            alert(`Error al cargar la ruta ${name}`);
            console.log(err);
        })
    }

    // Comienza la simulación
    function startSimulation(){
        // TODO
        if(current_route){
            if(simulating){
                alert("Hay una simulación en curso.");
                return;
            }
            simulating = true;
            chgSimBtn();

            // Convierto la ruta en series de puntos equidistantes
            var densifyParams = new DensifyParameters();
            densifyParams.geodesic = true;
            densifyParams.lengthUnit = "meters";
            densifyParams.maxSegmentLength = 30;
            densifyParams.geometries = [current_route.geometry];
            geometrySvc.densify(densifyParams)
            .then(data => {
                var simulation = {
                    iteration: 0,
                    coordinates: data[0].paths[0]
                }
                updateSimulation(simulation);
            })
            .catch(err => {
                alert("Error al calcular los puntos de ruta");
                console.log("Densify: ", err);
            });
        }else{
            alert("Primero debe indicarse una ruta.");
            return;
        }
    }

    // Para la simulación
    function stopSimulation(){
        // TODO
        if(simulating){
            //alert("Falta hacer");
            simulating = false;
            chgSimBtn();
        }else{
            alert("No hay una simulación en curso.")
        }
    }

    // Actualiza el mapa durante la simulación
    function updateSimulation(simulation){
        if(simulating){
            // Si ya no tengo mas coordenadas termino
            if(simulation.iteration >= simulation.coordinates.length){
                stopSimulation();
            }

            // Busca la coordenada, crea el marcador y lo agrega a la capa del móvil.
            var next_coordinate = simulation.coordinates[simulation.iteration];
            var new_marker = createSimulationMarker(next_coordinate[0], next_coordinate[1]);
            mobileLyr.removeAll();
            mobileLyr.add(new_marker);

            simulation.iteration++;
            setTimeout(updateSimulation, 100, simulation);
        }
    }

    // Crea el marcador del móvil
    function createSimulationMarker(lng, lat){
        return new Graphic({
                geometry: {
                    type: "point",
                    x: lng,
                    y: lat,
                    spatialReference: { wkid: 102100 }
                },
                symbol: carSymbol
            });
    }

    // Ejecuta el servicio Print para generar el PDF y luego se descarga
    function downloadPDF(){
        // TODO
        printWidget.viewModel.print(new PrintTemplate({
            format: "pdf",
            layout: "a4-landscape",
            layoutOptions: {
                titleText: "SIG - Obligatorio 2",
                authorText: "Grupo 7",
                copyrightText: "SIG - Grupo 7",
                scalebarUnit: "Kilometers",
                legendLayers: [],
                customTextElements: []
            },
            exportOptions: {
                width: 500,
                height: 400
            }
        }))
        .then(data => {
            console.log("URL: ", data);
            window.open(data.url);
        })
        .catch(err => {
            alert("Hubo un error al crear el PDF.");
            console.log(err);
        });
    }

    // Borra todas las features de una feature layer
    function clearFeatureLayer(fLyr){
        fLyr.queryObjectIds()
        .then(objectIds => {
            console.log(objectIds);
            var to_delete = [];
            objectIds.forEach(oId => {
                to_delete.push({objectId: oId});
            });
            console.log(to_delete);
            fLyr.applyEdits({
                deleteFeatures: to_delete
            })
            .then(() => {
                alert("Feature Layer borrada exitosamente.");
            })
            .catch(err => {
                alert("Ocurrió un error limpiando la feature layer.");
            });
        })
        .catch(err => {
            alert("Ocurrió un error limpiando la feature layer.");
        });
    }

    ///////////////////////////
    // AUXILIARES HTML
    //////////////////////////

    // Setea eventos javascript
    function initDocument(){
        $("#btnSaveStops").click(() => {
            saveStops();
        });
        $("#btnSaveRoute").click(() => {
            saveRoute();
        });
        $("#btnSimStatus").click(() => {
            if(simulating){
                stopSimulation();
            }else{
                startSimulation();
            }
        });
        $("#btnLoadStops").click(() => {
            loadStops();
        });
        $("#btnLoadRoute").click(() => {
            loadRoute();
        });
        $("#btnDownloadPDF").click(() => {
            downloadPDF();
        });
        $("#btnClearEventLayer").click(() => {
            clearFeatureLayer(stopsFLyr);
        });
        $("#btnClearRouteLayer").click(() => {
            clearFeatureLayer(routesFLyr);
        });
        $('.sidebarCollapse').on('click', function () {
            if($("#sidebar").hasClass("active")){
                $("#content").css("width", "85%");
            }else{
                $("#content").css("width", "100%");
            }
            $('#sidebar').toggleClass('active');
            $("#btnOpen").toggle(200);
            return false;
        });
    }

    // Agrega parada a lista de paradas
    function addStopHtml(stop){
        $("#stopList").append(`
            <li id="stopListItem${stop.id}">
                <a href="#">
                    ${stop.name} 
                    <span class="float-right">
                        <button type="button" class="btn btn-sm btn-outline-danger" style="cursor: pointer; display: none" title="Borrar parada">&#10006;</button>
                    </span>
                </a>
            </li>`);
        $(`#stopListItem${stop.id}`).hover(
            // in
            () => {
                $(`#stopListItem${stop.id} a span button`).show();
            },
            // out
            () => {
                $(`#stopListItem${stop.id} a span button`).hide();
            }
        );
        $(`#stopListItem${stop.id} a span button`).click(() => {
            removeStop(stop.id);    
        });
    }

    // Actualiza la lista de paradas
    function updateStopsList(){
        $("#stopList").html("<p>Paradas</p>");
        stops.forEach(stop => {
            addStopHtml(stop);
        });

        if(stops.length > 0){
            if(stops.length > 1){
                $("#stopList").append(`
                    <li class="text-center" style="margin-top: 10px;">
                        <div class="btn-group btn-group-sm" style="width: 90%;">
                            <button id="btnRemoveAllStops" type="button" class="btn btn-danger btn-sm"  style="cursor: pointer; width: 20%;" title="Borrar todas"><i class="fa fa-trash"></i></button>
                            <button id="btnSaveStops"      type="button" class="btn btn-warning btn-sm" style="cursor: pointer; width: 20%;" title="Guardar paradas"><i class="fa fa-save"></i></button>
                            <button id="btnSolveRoute"     type="button" class="btn btn-success btn-sm" style="cursor: pointer; width: 60%;" title="Generar Ruta"><i class="fa fa-bicycle"></i></button>
                        </div>
                    </li>
                `);
                $("#btnSolveRoute").click(() => {
                    solveRoute();
                });
            }else{
                $("#stopList").append(`
                    <li class="text-center" style="margin-top: 10px;">
                        <div class="btn-group btn-group-sm" style="width: 90%;">
                            <button id="btnRemoveAllStops" type="button" class="btn btn-danger btn-sm"  style="cursor: pointer; width: 50%" title="Borrar todas"><i class="fa fa-trash"></i></button>
                            <button id="btnSaveStops"      type="button" class="btn btn-success btn-sm" style="cursor: pointer; width: 50%" title="Guardar paradas"><i class="fa fa-save"></i></button>
                        <div>
                    </li>
                `);
            }
            $("#btnSaveStops").click(() => {
                saveStops();
            });
            $("#btnRemoveAllStops").click(() => {
                stops.forEach(stop => removeStop(stop.id));
            });
        }else{
            $("#stopList").append(`
                <p><small>Ingrese paradas con la barra de búsqueda.</small></p>
                <li class="text-center">
                    <button id="btnLoadStops" type="button" class="btn btn-success btn-sm" style="cursor: pointer;" title="Cargar paradas">Cargar paradas <i class="fa fa-road"></i></button>
                </li>
            `);
            $("#btnLoadStops").click(() => {
                loadStops();
            });
        }
    }

    // Actualiza el boton de play
    function chgSimBtn(){
        if(simulating){
            $("#btnSimStatus").removeClass();
            $("#btnSimStatus").addClass("btn btn-danger");
            $("#btnSimStatus").html(`<i class="fa fa-stop"></i>`)
        }else{
            $("#btnSimStatus").removeClass();
            $("#btnSimStatus").addClass("btn btn-success");
            $("#btnSimStatus").html(`<i class="fa fa-play"></i>`)
        }
    }

    ///////////////////////////
    // UTILS
    //////////////////////////

    function isNullOrWhitespace(str) {
        if (typeof str === 'undefined' || str == null) 
            return true;
        return str.replace(/\s/g, '').length < 1;
    }

    function isAlphanumeric(str){
        return /^[a-z0-9]+$/i.test(str);
    }

});