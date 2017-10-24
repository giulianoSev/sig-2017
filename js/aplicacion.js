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
    "esri/tasks/QueryTask",
    "esri/tasks/support/BufferParameters",
    "esri/tasks/PrintTask",
    "esri/tasks/support/PrintParameters",
    "esri/tasks/support/PrintTemplate",
    "esri/tasks/support/LegendLayer",
    "esri/geometry/geometryEngine",
    "esri/tasks/support/AreasAndLengthsParameters",
    "esri/geometry/Polyline",
    "dojo/domReady!"
], function(
    Map, TileLayer, MapView, Graphic, GraphicsLayer, RouteTask, RouteParameters,
    FeatureSet, urlUtils, on, Search, Locator, FeatureLayer, Print, PrintVM, PrintTemplate, Query, GeometryService,
    DensifyParameters, QueryTask, BufferParameters, PrintTask, PrintParameters, PrintTemplate, LegendLayer, geometryEngine,
    AreasAndLengthsParameters, Polyline
) {
    //////////////////////////////////////////////////////
    // DEFINICIONES Y CONSTANTES
    //////////////////////////////////////////////////////

    // Varibles Globales
    var token = null;
    var stops = [];
    var simulating = false;
    var current_route = null;
    var mode = "service";

    // Símbolos
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
        color: "black",
        width: 3,
        style: "dash"
    };
    var carSymbol = {
        type: "picture-marker",
        url: "assets/car.png",
        width: "40px",
        height: "40px"
    };
    var bufferSymbol = {
        type: "simple-fill",
        color: [140, 140, 222, 0.5],
        outline: {
            color: [0, 0, 0, 0.5],
            width: 2
        }
    };
    var countySymbol = {
        type: "simple-line",
        color: [247, 153, 71, 0.5],
        width: 3
    };
    var stateSymbol = {
        type: "simple-line",
        color: [131, 94, 242, 0.5],
        width: 3
    };
    

    //////////////////////////////////////////////////////
    // AUTENTICACIÓN
    //////////////////////////////////////////////////////

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
            showToast("Error al obtener el token", "error");
        }
    });

    //////////////////////////////////////////////////////
    // INIT
    //////////////////////////////////////////////////////

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
    var routeLyr = new GraphicsLayer({
        title: "Ruta",
        id: "routeLyr"
    });
    map.layers.add(routeLyr);
    
    // var legendRouteLyr = new LegendLayer({
    //     leyerId: "routeLyr",
    //     subLayerIds: [],
    //     title: "Ruta"
    // })

    // Se deja definida la capa de paradas 
    var stopsLyr = new GraphicsLayer({
        title: "Paradas",
        id: "stopsLyr"
    });
    map.layers.add(stopsLyr);


    // var legendStopsLyr = new LegendLayer({
    //     layerId: "stopsLyr",
    //     subLayerIds: [],
    //     title: "Paradas"
    // })


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

    // Se define el servicio para operaciones espaciales
    var geometrySvc = new GeometryService({url: "https://sampleserver6.arcgisonline.com/arcgis/rest/services/Utilities/Geometry/GeometryServer"});

    // Se definen las QueryTasks para consultar por los condados y estados
    var countiesQueryTask = new QueryTask({url: "http://services.arcgisonline.com/ArcGIS/rest/services/Demographics/USA_1990-2000_Population_Change/MapServer/3"});
    var statesQueryTask = new QueryTask({url: "http://services.arcgisonline.com/ArcGIS/rest/services/Demographics/USA_1990-2000_Population_Change/MapServer/4"});

    // Init Eventos Javascript
    initDocument();

    //////////////////////////////////////////////////////
    // WIDGETS
    //////////////////////////////////////////////////////


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
    // Se crea la PrintTask
    var printTask = new PrintTask({
        url: "https://sampleserver6.arcgisonline.com/arcgis/rest/services/Utilities/PrintingTools/GPServer/Export%20Web%20Map%20Task",
    });

    // Seteo los parámetros de impresión
    var printParams = new PrintParameters ({
        spatialReference: { wkid: 102100 },
        template: new PrintTemplate ({
            exportOptions: {
                width: 500,
                height: 400,
                dpi: 96
            },
            layoutOptions: {
                titleText: "La solución contundente a su problema de ruteo",
                authorText: "Grupo 7",
                copyrightText: "SIG"
            },
            // legendLayers: [legendRouteLyr, legendStopsLyr]},
            format: "pdf",
            layout: "a4-landscape",
        }),
        view: view
    });


    //////////////////////////////////////////////////////
    // EVENTOS
    //////////////////////////////////////////////////////

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
                spatialReference: { wkid: 102100 }, 
                // Atributos para el servidor de eventos
                attributes: {
                    event_type: "17", 
                    description: result.result.name
                }
            })
        };
        addStop(stop);
    });


    //////////////////////////////////////////////////////
    // AUXILIARES JS
    //////////////////////////////////////////////////////

    // Agrega una parada y su punto en el mapa
    function addStop(stop){
        // Establece el id
        stop.id = stops.length + 1;

        // Agrega a la capa de paradas
        stopsLyr.add(stop.graphic);

        stops.push(stop);

        // Cambios en View
        updateStopsList();
    }

    // Quita una parada y su punto en el mapa
    function removeStop(stopId){
        var stop = _.find(stops, s => s.id == stopId);
        stops = _.without(stops, stop);

        // view.graphics.remove(stop.graphic);

        // Quito stop de la capa de paradas
        stopsLyr.remove(stop.graphic)
        updateStopsIds();

        // Quito la ruta 
        routeLyr.removeAll();
        current_route = null;

        // Cambios en View
        updateStopsList();
    }

    // Reordena las paradas
    function updateStop(original_pos, new_pos){
        var new_stops = [];
        if(original_pos > new_pos){
            // Sube de posicion
            // Hasta new_pos son todos iguales
            var i;
            for(i = 0; i < new_pos-1; i++){
                new_stops.push(stops[i]);
            }
            // Cuando llega a new_pos se mete el elemento que estaba en la original
            new_stops.push(stops[original_pos-1]);

            // Luego se meten todos los que venian menos el original
            for(i; i < stops.length; i++){
                if(i == original_pos-1)
                    continue;
                new_stops.push(stops[i]);
            }
        }else if(original_pos < new_pos){
            // Baja de posicion
            // Hasta new_pos son todos iguales salvo el original
            var i;
            for(i = 0; i < new_pos; i++){
                if(i == original_pos-1)
                    continue;
                new_stops.push(stops[i]);
            }
            // Se mete el elemento original
            new_stops.push(stops[original_pos-1]);

            // Hasta el final se meten como estaban
            for(i; i < stops.length; i++){
                new_stops.push(stops[i]);
            }
        }else{
            return;
        }

        stops = new_stops;
        updateStopsIds();
    }

    // Asigna el id de las paradas segun su posicion
    function updateStopsIds(){
        for(var i = 0; i < stops.length; i++){
            stops[i].id = i+1;
        }
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
            showToast("Tiene que haber 2 o más paradas", "error");
            return;
        }

        showSpinner();
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
            enableRouteButtons();
            showToast("Ruta calculada con éxito", "info");
        })
        .catch(() => {
            showToast("Ocurrió un error al calcular la ruta", "error");
        })
        .then(() => hideSpinner());
    }

    // Guarda las paradas en el feature server
    function saveStops(){
        var adds = [];
        stops.forEach(stop => {
            adds.push(stop.graphic);
        });
        showSpinner();
        stopsFLyr.applyEdits({
            addFeatures: adds
        })
        .then(() => {
            showToast("Paradas guardadas!", "info");
        })
        .catch(err => {
            console.log("Save Stops: ", err);
            showToast("Ocurrió un error guardando las paradas", "error");
        })
        .then(() => hideSpinner());
    }

    // Carga las paradas desde el feature server
    function loadStops(){
        var query = new Query();
        query.where = "event_type = '17'";
        query.returnGeometry = true;
        query.outSpatialReference = { wkid: 102100 };

        showSpinner();
        stopsFLyr.queryFeatures(query)
        .then((featureSet) => {
            console.log(featureSet);
            if(featureSet.features.length < 1){
                showToast("No hay paradas guardadas", "error");
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
                        spatialReference: { wkid: 102100 }, 
                        // Atributos para el servidor de eventos
                        attributes: {
                            event_type: "17", 
                            description: feature.attributes.description
                        }
                    })
                };

                addStop(stop);
                showToast("Paradas cargadas con éxito", "info");
            });
        })
        .catch(err => {
            console.log(err);
            showToast("Ocurrió un error cargando las paradas", "error");
        })
        .then(() => hideSpinner());
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
                showToast(`"${name}" es un nombre inválido para la ruta.`, "error");
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

            showSpinner();
            routesFLyr.applyEdits({
                addFeatures: [route_graphic]
            })
            .then(() => {
                showToast("Ruta guardada!", "info");
            })
            .catch(err => {
                console.log("Save Route: ", err);
                showToast("Error al guardar ruta", "error");
            })
            .then(() => hideSpinner());
        }else{
            showToast("Debe haber una ruta cargada para guardar", "error");
        }
    }

    // Carga una ruta seleccionada desde el feature server
    function loadRoute(){
        var name = window.prompt("Nombre de la ruta", "");
        if(!name){
            return;
        }
        if(isNullOrWhitespace(name) || !isAlphanumeric(name)){
            showToast(`"${name}" es un nombre inválido para la ruta.`, "error");
            return;
        }

        var query = new Query();
        query.where = `notes = 'sig_grupo7_${name}'`;
        query.returnGeometry = true;
        query.outSpatialReference = { wkid: 102100 };
        
        showSpinner();
        routesFLyr.queryFeatures(query)
        .then(featureSet =>{
            var routeResult = {
                geometry: featureSet.features[0].geometry,
                symbol: routeSymbol
            };
            routeLyr.removeAll();
            routeLyr.add(routeResult);

            current_route = routeResult;
            enableRouteButtons();
            showToast("Ruta cargada con éxito", "info");
        })
        .catch (err => {
            console.log("Load Route: ", err);
            showToast(`Error al cargar la ruta ${name}`, "error");
        })
        .then(() => hideSpinner());
    }

    // Comienza la simulación
    function startSimulation(){
        if(current_route){
            if(simulating){
                showToast("Hay una simulación en curso.", "error");
                return;
            }
            simulating = true;
            chgSimBtn();
            
            var simulation = {
                iteration: 0,
                buffer_size: getBufferSize(),
                segment_length: 100, // 100m
                step: getSimStep(),
                travelled_length: 0, // km
                last_exec_time: 0,
                coordinates: null
            }

            // Se obtiene la ruta como una serie de puntos equidistantes
            // Se utiliza Geometry Engine o Service dependiendo del modo
            getDensify(simulation).then(path => {
                simulation.coordinates = path;
                simulation.last_exec_time = performance.now();
                
                disableSimButtons();
                showToast("Simulación iniciada", "info");
                updateSimulation(simulation);
            });
        }else{
            showToast("Primero debe indicarse una ruta.", "error");
            return;
        }
    }

    // Para la simulación
    function stopSimulation(){
        if(simulating){
            simulating = false;
            
            chgSimBtn();
            enableSimButtons();
            showToast("Simulación finalizada!", "info");
        }else{
            showToast("No hay una simulación en curso", "error");
        }
    }

    // Actualiza el mapa durante la simulación
    function updateSimulation(simulation){
        if(simulating){
            // Si ya no tengo mas coordenadas termino
            if(simulation.iteration >= simulation.coordinates.length){
                stopSimulation();
                return;
            }

            // Si me paso lo seteo en el ultimo
            if(simulation.iteration + simulation.step >= simulation.coordinates.length){
               simulation.iteration = simulation.coordinates.length-1; 
            }

            // Busca la coordenada, crea el marcador.
            var next_coordinate = simulation.coordinates[simulation.iteration];
            var new_marker = createSimulationMarker(next_coordinate[0], next_coordinate[1]);

            // Crea la línea de velocidad
            if(simulation.iteration > 1){
                routeLyr.graphics.add(new Graphic({
                    geometry: new Polyline({
                        paths: [simulation.coordinates[simulation.iteration-2], simulation.coordinates[simulation.iteration-1]],
                        spatialReference: { wkid: 102100 }
                    }),
                    symbol: {
                        type: "simple-line",
                        color: [255, 0, 0],
                        width: "5",
                    }
                }));
            }

            // Calculo el buffer y lo agrego a la capa con el móvil.
            getBuffer(new_marker, simulation).then(buffer => {
                if(simulating){
                    var counties = queryCounty(buffer, simulation);
                    var states = queryState(buffer, simulation);

                    // Cuando terminen las queries se renderizan
                    Promise.all([counties, states])
                    .then(results => {
                        if(simulating){
                            var graphics = [];
                            var content = "";
                            var counties_promise = Promise.resolve(false);

                            if(results[1]){
                                content += `
                                    <b>Estados intersectados: </b><br/>
                                    <ul>
                                `;
                                results[1].forEach(state => {
                                    graphics.push(state.graphic);
                                    content += `
                                        <li>${state.name}, ${state.st_abbrev}</li>
                                    `;
                                });
                                content += `
                                    </ul>
                                `;
                            }
                            if(results[0]){
                                content += `
                                    <b>Condados intersectados: </b><br/>
                                    <ul>
                                `;
                                var population_promises = [];
                                results[0].forEach(county => {
                                    graphics.push(county.graphic);
                                    population_promises.push(
                                        getLocalPopulation(buffer, county)
                                        .then(local_population => {
                                            var population_percentage = Math.round((local_population / county.total_population) * 100); 
                                            return {
                                                local_population: local_population,
                                                county_population: county.total_population,
                                                list_item: `<li>${county.name}, ${county.st_abbrev} - ${local_population}/${county.total_population} (%${population_percentage})</li>`
                                            }
                                        }
                                    ));
                                });

                                counties_promise = Promise.all(population_promises)
                                .then(counties_info => {
                                    var total_local_population = 0;
                                    var total_county_population = 0;
                                    counties_list = "";
                                    counties_info.forEach(county_info => {
                                        total_local_population += county_info.local_population;
                                        total_county_population += county_info.county_population;
                                        counties_list += county_info.list_item;
                                    });

                                    var population_percentage = Math.round((total_local_population / total_county_population) * 100); 
                                    var travelled_km = Math.round(simulation.travelled_length / 1000);
                                    var step_distance = simulation.step * simulation.segment_length > 1000 ? 
                                        (simulation.step * simulation.segment_length / 1000) + "km" : 
                                        (simulation.step * simulation.segment_length) + "m";
                                    // var actual_velocity = Math.round((simulation.segment_length / 1000) / ((performance.now() - simulation.last_exec_time) / 3600000));
                                    content += counties_list;
                                    content += `
                                        </ul>
                                        <b>Población total en el buffer: ${total_local_population} (%${population_percentage})</b>
                                        <hr/>
                                        <b>Distancia recorrida: ${travelled_km}km</b><br/>
                                        <b>Distancia por iteración: ${step_distance}</b>
                                    `;
                                    return true;
                                });
                            }

                            Promise.all([counties_promise])
                            .then(results => {
                                if(results[0]){
                                    graphics.push(new_marker);
                                    graphics.push(buffer);

                                    mobileLyr.removeAll();
                                    mobileLyr.addMany(graphics);

                                    // Actualizo el popup
                                    view.popup.open({
                                        title: "Información de la simulación",
                                        content: content,
                                        dockEnabled: true,
                                        dockOptions: {
                                            breakpoint: false,
                                            buttonEnabled: false,
                                            position: "top-right"
                                        }
                                    });

                                    simulation.step = getSimStep();
                                    simulation.buffer_size = getBufferSize();

                                    simulation.iteration += simulation.step;
                                    simulation.travelled_length += simulation.segment_length * simulation.step;
                                    simulation.last_exec_time = performance.now();
                                    updateSimulation(simulation);
                                }
                            });
                        }
                    });
                }
            });
        }
    }

    // Obtiene la ruta actual como una serie de puntos equidistantes
    function getDensify(simulation){
        var path_promise;
        if(mode == "service"){
            var densifyParams = new DensifyParameters({
                geometries: [current_route.geometry],
                lengthUnit: "meters",
                maxSegmentLength: simulation.segment_length,
                geodesic: true
            });

            path_promise = geometrySvc.densify(densifyParams)
            .then(data => {
                return data[0].paths[0];
            })
            .catch(err => {
                alert("Error al calcular los puntos de ruta");
                console.log("Densify: ", err);
            });
        } else if(mode == "engine"){
            path_promise = Promise.resolve(
                geometryEngine.densify(current_route.geometry, simulation.segment_length, "meters").paths[0]
            );
        }

        return Promise.all([path_promise])
        .then(paths => {
            return paths[0];
        });
    }

    // Obtiene la cantidad de población dentro del buffer
    function getLocalPopulation(buffer, county){
        // Paso el área del condado a metro^2
        var land_area = county.land_area * 2.58999;

        // Obtengo el área de intersección
        var intersect_area_promise;
        if(mode == "service"){
            intersect_area_promise = geometrySvc.intersect([buffer.geometry], county.graphic.geometry)
            .then(areas => {
                var areas_params = new AreasAndLengthsParameters({
                    areaUnit: "square-kilometers",
                    calculationType: "geodesic",
                    lengthUnit: "kilometers",
                    polygons: areas
                });

                return geometrySvc.areasAndLengths(areas_params)
                .then(results => {
                    return results.areas[0]
                })
                .catch(err => {
                    console.log("Areas: ", err);
                    showToast("Ocurrió un error calculando la intersección de áreas");
                });
            })
            .catch(err => {
                console.log("Intersects: ", err);
                showToast("Error calculando la interseccion", "error");
            });
        }else if(mode == "engine"){
            intersect_area_promise = Promise.resolve(geometryEngine.geodesicArea(
                geometryEngine.intersect(buffer.geometry, county.graphic.geometry), 
                "square-kilometers"
            ));
        }else{
            showToast("No hay modo seleccionado", "error");
        }

        return Promise.all([intersect_area_promise])
        .then(intersect_areas => {
            // Obtengo el porcentaje de área ocupada
            var cover_percentage = intersect_areas[0] / land_area;

            // Obtengo la poblacion dentro del buffer
            return Math.round(county.total_population * cover_percentage);
        });
        
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
        printTask.execute(printParams)
        .then(result => {
            window.open(result.url, "_blank");
        })
        .catch(err => {
            console.log("Print PDF: ", err);
            showToast("Hubo un error al crear el PDF", "error");
        });
    }

    // Borra todas las features de una feature layer
    function clearFeatureLayer(fLyr){
        showSpinner();
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
                showToast("Feature Layer borrada exitosamente", "info");
            })
            .catch(err => {
                console.log("Clear Feature Layer: ", err);
                showToast("Feature Layer borrada exitosamente", "info");
            });
        })
        .catch(err => {
            console.log("Clear Feature Layer: ", err);
            showToast("Ocurrió un error limpiando la feature layer", "error");
        })
        .then(() => hideSpinner());
    }

    // Obtiene el buffer 
    function getBuffer(marker, simulation){
        if(simulating){

            var buffer_promise;
            if(mode == "service"){
                var bufferParams = new BufferParameters({
                    geometries: [marker.geometry],
                    distances: [simulation.buffer_size],
                    unit: "kilometers",
                    geodesic: true
                });

                buffer_promise = geometrySvc.buffer(bufferParams)
                .then(buffer => {
                    return buffer[0];
                })
                .catch(err => {
                    console.log("Buffer: ", err)
                    showToast("Error calculando el buffer", "error");
                });
            }else if(mode == "engine"){
                buffer_promise = Promise.resolve(
                    geometryEngine.geodesicBuffer(marker.geometry, simulation.buffer_size, "kilometers")
                );
            }else{
                showToast("No hay modo seleccionado", "error");
            }

            return Promise.all([buffer_promise]).then((buffers) => {
                return new Graphic({
                    geometry: buffers[0],
                    symbol: bufferSymbol
                });
            });
        }else{
            showToast("No hay simulación en progreso", "error");
        }
    }

    // Se consulta por los condados en cierto buffer
    function queryCounty(buffer, simulation){
        if(simulating){
            var query = new Query({
                geometry: buffer.geometry,
                spatialRelationship: "intersects",
                // Atributos a devolver
                // NAME: Nombre
                // TOTPOP_CY: Poblacion total
                // LANDAREA: Área total en millas^2
                // ST_ABBREV: Nombre del condado abreviado
                outFields: ["NAME","TOTPOP_CY","LANDAREA", "ST_ABBREV"],
                outSpatialReference: { wkid: 102100 },
                returnGeometry: true
            });
            return countiesQueryTask.execute(query).then(data => {
                var counties = [];
                data.features.forEach(feature => {
                    counties.push({
                        name: feature.attributes.NAME, 
                        total_population: feature.attributes.TOTPOP_CY,
                        land_area: feature.attributes.LANDAREA,
                        st_abbrev: feature.attributes.ST_ABBREV,
                        graphic: new Graphic({
                            geometry: feature.geometry,
                            symbol: countySymbol
                        })
                    });
                })
                return counties;
            })
            .catch(err => {
                console.log("County Query Task: ", err);
                showToast("Error obteniendo los condados", "error");
            });
        }else{
            showToast("No hay simulación en progreso", "error");
        }
    }

    // Se consulta por los estados en cierto buffer
    function queryState(buffer, simulation){
        if(simulating){
            var query = new Query({
                geometry: buffer.geometry,
                spatialRelationship: "intersects",
                // Atributos a devolver
                // NAME: Nombre
                // ST_ABBREV: Nombre del estado abreviado
                outFields: ["NAME", "ST_ABBREV"],
                outSpatialReference: { wkid: 102100 },
                returnGeometry: true
            });

            return statesQueryTask.execute(query)
            .then(data => {
                var states = [];
                data.features.forEach(feature => {
                    states.push({
                        name: feature.attributes.NAME,
                        st_abbrev: feature.attributes.ST_ABBREV,
                        graphic: new Graphic({
                            geometry: feature.geometry,
                            symbol: stateSymbol
                        })
                    });
                })
                return states;
            })
            .catch(err => {
                console.log("State Query Task: ", err);
                showToast("Error consultando estados", "error");
            });
        }else{
            showToast("No hay simulación en progreso", "error");
        }
    }

    //////////////////////////////////////////////////////
    // AUXILIARES HTML
    //////////////////////////////////////////////////////

    // Setea eventos javascript
    function initDocument(){
        // Quito spinner
        hideSpinner();

        // Habilita botones de la página
        $("#btnLoadStops").prop('disabled', false);
        $("#btnLoadRoute").prop('disabled', false);
        $("#btnDownloadPDF").prop('disabled', false);
        $("#btnClearEventLayer").prop('disabled', false);
        $("#btnClearRouteLayer").prop('disabled', false);

        // Opciones de simulación
        if(mode == "service"){
            $("#btnModeEngine").removeClass();
            $("#btnModeEngine").addClass("btn btn-secondary");
            $("#btnModeService").addClass("btn btn-success");
        }else if(mode == "engine"){
            $("#btnModeService").removeClass();
            $("#btnModeService").addClass("btn btn-secondary");
            $("#btnModeEngine").addClass("btn btn-success");
        }

        // Evt click
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
        $("#stopList").sortable({
            items: "li",
            start: function(event, ui) {
                ui.item.startPos = ui.item.index();
            },
            stop: function(event, ui) {
                updateStop(ui.item.startPos, ui.item.index());
            }
        });
        $("#btnModeEngine").click(() => { 
            mode = "engine"; 
            $("#btnModeService").removeClass();
            $("#btnModeService").addClass("btn btn-secondary");
            $("#btnModeEngine").addClass("btn btn-success");
        });
        $("#btnModeService").click(() => { 
            mode = "service";
            $("#btnModeEngine").removeClass();
            $("#btnModeEngine").addClass("btn btn-secondary");
            $("#btnModeService").addClass("btn btn-success");
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
                    <i class="fa fa-bars"></i>
                    <span class="float-right">
                        <button type="button" class="btn btn-sm btn-outline-danger" style="cursor: pointer; display: none" title="Borrar parada">&#10006;</button>
                    </span>
                    ${stop.name} 
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

    // Habilita los botones cuando hay una ruta cargada
    function enableRouteButtons(){
        $("#btnSaveRoute").prop('disabled', false);
        $("#btnSimStatus").prop('disabled', false);
    }

    // Habilita los botones mientras no haya simulación
    function enableSimButtons(){
        $("#btnRemoveAllStops").prop('disabled', false);
        $("#btnLoadRoute").prop('disabled', false);
        $("#btnLoadStops").prop('disabled', false);
        $("#btnSolveRoute").prop('disabled', false);
        $("#btnDownloadPDF").prop('disabled', false);
        $("#btnClearEventLayer").prop('disabled', false);
        $("#btnClearRouteLayer").prop('disabled', false);
    }

    // Deshabilita los botones mientras haya simulación
    function disableSimButtons(){
        $("#btnRemoveAllStops").prop('disabled', true);
        $("#btnLoadRoute").prop('disabled', true);
        $("#btnLoadStops").prop('disabled', true);
        $("#btnSolveRoute").prop('disabled', true);
        $("#btnDownloadPDF").prop('disabled', true);
        $("#btnClearEventLayer").prop('disabled', true);
        $("#btnClearRouteLayer").prop('disabled', true);
    }

    // Muestra el spinner
    function showSpinner(){
        $("#spinner").fadeIn(200);
    }

    // Oculta el spinner
    function hideSpinner(){
        $("#spinner").fadeOut(200);
    }

    // Muestra el toast
    function showToast(msg, type){
        $("#toast").removeClass();
        
        if(type == "error"){
            $("#toast").addClass("btn btn-danger");
        }else if(type == "info"){
            $("#toast").addClass("btn btn-success");
        }

        $("#toast").html(msg);
        $("#toast").fadeIn(500);
        setTimeout(hideToast, 5000);
    }

    // Oculta el toast
    function hideToast(){
        $("#toast").fadeOut(500);
    }

    // Retorna el valor del buffer ingresado
    function getBufferSize(){
        var val = $("#nmbBufferSize").val();
        if(val && parseInt(val) >= 1){
            return parseInt(val);
        }else{
            return 1;
        }
    }

    // Retorna la cantidad de pasos
    function getSimStep(){
        var step = $("#nmbStepSize").val();
        if(step && parseInt(step) >= 1){
            return parseInt(step);
        }else{
            return 1;
        }
    }

    //////////////////////////////////////////////////////
    // UTILS
    //////////////////////////////////////////////////////

    function isNullOrWhitespace(str) {
        if (typeof str === 'undefined' || str == null) 
            return true;
        return str.replace(/\s/g, '').length < 1;
    }

    function isAlphanumeric(str){
        return /^[a-z0-9]+$/i.test(str);
    }

    function hsv2rgb(h, s, v) {
        var rgb, i, data = [];
        if (s === 0) {
            rgb = [v,v,v];
        } else {
            h = h / 60;
            i = Math.floor(h);
            data = [v*(1-s), v*(1-s*(h-i)), v*(1-s*(1-(h-i)))];
            switch(i) {
            case 0:
                rgb = [v, data[2], data[0]];
                break;
            case 1:
                rgb = [data[1], v, data[0]];
                break;
            case 2:
                rgb = [data[0], v, data[2]];
                break;
            case 3:
                rgb = [data[0], data[1], v];
                break;
            case 4:
                rgb = [data[2], data[0], v];
                break;
            default:
                rgb = [v, data[0], data[1]];
                break;
            }
        }
        return '#' + rgb.map(function(x){
            return ("0" + Math.round(x*255).toString(16)).slice(-2);
        }).join('');
    };

});