require('dotenv').config();
const https = require('https');

const GOOGLE_KEY = process.env.GOOGLE_BACKEND_MAPS_KEY;

const PLACES = {
    // Mumbai Metro Line 1
    ghatkopar: {
        latitude: 19.0863,
        longitude: 72.9090
    },

    weh: {
        latitude: 19.1158,
        longitude: 72.8540
    },

    // Mumbai Metro Line 7 / Red Line
    gundavali: {
        latitude: 19.1145,
        longitude: 72.8552
    },

    mogra: {
        latitude: 19.1300,
        longitude: 72.8470
    },

    goregaonEast: {
        latitude: 19.1570,
        longitude: 72.8560
    },

    poisar: {
        latitude: 19.2084,
        longitude: 72.8443
    },

    // Line 9 extension / Red Line
    dahisarEast: {
        latitude: 19.2540,
        longitude: 72.8690
    },

    kashigaon: {
        latitude: 19.27764,
        longitude: 72.88024
    },

    // Line 2A test
    andheriWest: {
        latitude: 19.1360,
        longitude: 72.8350
    }
};


// --------------------------------------------------
// HTTP REQUEST
// --------------------------------------------------

function requestGoogle(url, body, headers) {
    return new Promise((resolve, reject) => {
        const req = https.request(
            url,
            {
                method: 'POST',
                headers
            },
            (res) => {
                let data = '';

                res.on('data', chunk => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        resolve({
                            status: res.statusCode,
                            data: JSON.parse(data)
                        });
                    } catch {
                        resolve({
                            status: res.statusCode,
                            data
                        });
                    }
                });
            }
        );

        req.on('error', reject);

        req.write(JSON.stringify(body));
        req.end();
    });
}


// --------------------------------------------------
// GOOGLE ROUTES TEST
// --------------------------------------------------

async function testRoute(name, origin, destination, routingPreference) {

    console.log('\n');
    console.log('='.repeat(80));
    console.log(`TEST: ${name}`);
    console.log('='.repeat(80));

    const url =
        'https://routes.googleapis.com/directions/v2:computeRoutes';

    const body = {
        origin: {
            location: {
                latLng: origin
            }
        },

        destination: {
            location: {
                latLng: destination
            }
        },

        travelMode: 'TRANSIT',

        // Explicitly allow every transit type relevant to our MVP.
        transitPreferences: {
            allowedTravelModes: [
                'BUS',
                'SUBWAY',
                'TRAIN',
                'LIGHT_RAIL',
                'RAIL'
            ],

            routingPreference
        },

        // Google can return the default route plus
        // up to three alternatives when available.
        computeAlternativeRoutes: true
    };

    const headers = {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_KEY,

        'X-Goog-FieldMask': [
            'routes.routeLabels',
            'routes.duration',
            'routes.distanceMeters',

            'routes.localizedValues',

            'routes.travelAdvisory.transitFare',

            'routes.legs.steps.travelMode',
            'routes.legs.steps.startLocation',
            'routes.legs.steps.endLocation',
            'routes.legs.steps.polyline',
            'routes.legs.steps.transitDetails'
        ].join(',')
    };

    try {

        const response = await requestGoogle(
            url,
            body,
            headers
        );

        console.log(`HTTP Status: ${response.status}`);

        if (
            response.status !== 200 ||
            !response.data.routes
        ) {
            console.log(
                'Google returned an error/no route:'
            );

            console.log(
                JSON.stringify(
                    response.data,
                    null,
                    2
                ).substring(0, 3000)
            );

            return;
        }

        const routes = response.data.routes;

        console.log(
            `Routes returned: ${routes.length}`
        );

        routes.forEach(
            (route, routeIndex) => {

                console.log('\n' + '-'.repeat(70));
                console.log(
                    `ROUTE ${routeIndex + 1}`
                );
                console.log('-'.repeat(70));

                console.log(
                    'Label:',
                    route.routeLabels || 'N/A'
                );

                console.log(
                    'Distance:',
                    route.distanceMeters,
                    'meters'
                );

                console.log(
                    'Duration:',
                    route.duration
                );

                const fare =
                    route.travelAdvisory?.transitFare;

                if (fare) {
                    console.log(
                        'Fare:',
                        `${fare.currencyCode || ''}${fare.units || ''}`
                    );
                } else {
                    console.log(
                        'Fare: Not provided'
                    );
                }

                const steps =
                    route.legs?.[0]?.steps || [];

                console.log(
                    'Total steps:',
                    steps.length
                );

                const modes = [];

                steps.forEach(
                    (step, index) => {

                        console.log(
                            `\nStep ${index + 1}`
                        );

                        console.log(
                            'Travel mode:',
                            step.travelMode
                        );

                        modes.push(
                            step.travelMode
                        );

                        // Walking segment
                        if (
                            step.travelMode === 'WALK'
                        ) {

                            console.log(
                                'Walking segment'
                            );

                            return;
                        }

                        // Transit segment
                        if (
                            step.travelMode !== 'TRANSIT' ||
                            !step.transitDetails
                        ) {
                            return;
                        }

                        const transit =
                            step.transitDetails;

                        const line =
                            transit.transitLine || {};

                        const vehicle =
                            line.vehicle || {};

                        const stops =
                            transit.stopDetails || {};

                        const vehicleType =
                            vehicle.type ||
                            'UNKNOWN';

                        console.log(
                            'Transit vehicle:',
                            vehicleType
                        );

                        console.log(
                            'Vehicle name:',
                            vehicle.name ||
                            'Unknown'
                        );

                        console.log(
                            'Line:',
                            line.name ||
                            line.nameShort ||
                            'Unknown'
                        );

                        console.log(
                            'Agency:',
                            line.agencies
                                ?.map(a => a.name)
                                .join(', ') ||
                            'Unknown'
                        );

                        console.log(
                            'Headsign:',
                            transit.headsign ||
                            'Unknown'
                        );

                        console.log(
                            'Departure stop:',
                            stops.departureStop
                                ?.name ||
                            'Unknown'
                        );

                        console.log(
                            'Departure time:',
                            stops.departureTime ||
                            'Unknown'
                        );

                        console.log(
                            'Arrival stop:',
                            stops.arrivalStop
                                ?.name ||
                            'Unknown'
                        );

                        console.log(
                            'Arrival time:',
                            stops.arrivalTime ||
                            'Unknown'
                        );

                        console.log(
                            'Stops:',
                            stops.intermediateStops
                                ?.length ??
                            'Not provided'
                        );

                        console.log(
                            'Polyline:',
                            step.polyline
                                ?.encodedPolyline
                                ? 'Present'
                                : 'Missing'
                        );
                    }
                );

                // --------------------------------------------------
                // DETECT TRANSPORT TYPES
                // --------------------------------------------------

                const transitSteps =
                    steps.filter(
                        step =>
                            step.travelMode ===
                            'TRANSIT'
                    );

                const transitTypes =
                    transitSteps
                        .map(
                            step =>
                                step.transitDetails
                                    ?.transitLine
                                    ?.vehicle
                                    ?.type
                        )
                        .filter(Boolean);

                const uniqueTransitTypes =
                    [...new Set(transitTypes)];

                console.log('\nDetected transit types:');

                if (
                    uniqueTransitTypes.length
                ) {
                    console.log(
                        uniqueTransitTypes.join(
                            ' + '
                        )
                    );
                } else {
                    console.log(
                        'NONE'
                    );
                }

                const hasBus =
                    uniqueTransitTypes.includes(
                        'BUS'
                    );

                const hasMetro =
                    uniqueTransitTypes.some(
                        type =>
                            type ===
                            'SUBWAY' ||
                            type ===
                            'METRO_RAIL'
                    );

                const hasTrain =
                    uniqueTransitTypes.some(
                        type =>
                            type ===
                            'TRAIN' ||
                            type ===
                            'COMMUTER_TRAIN' ||
                            type ===
                            'HEAVY_RAIL' ||
                            type ===
                            'RAIL'
                    );

                console.log('\nCoverage result:');

                console.log(
                    'Bus:',
                    hasBus ? 'YES' : 'NO'
                );

                console.log(
                    'Metro/Subway:',
                    hasMetro ? 'YES' : 'NO'
                );

                console.log(
                    'Train/Rail:',
                    hasTrain ? 'YES' : 'NO'
                );

                const metroLines =
                    transitSteps
                        .map(
                            step =>
                                step.transitDetails
                                    ?.transitLine
                                    ?.name ||
                                step.transitDetails
                                    ?.transitLine
                                    ?.nameShort
                        )
                        .filter(Boolean);

                if (metroLines.length) {
                    console.log(
                        'Transit lines:',
                        [
                            ...new Set(
                                metroLines
                            )
                        ].join(' → ')
                    );
                }

                // Detect whether the route actually
                // changes between different transit services.
                if (
                    uniqueTransitTypes.length > 1
                ) {
                    console.log(
                        'MULTI-MODE TRANSIT: YES'
                    );
                }

                if (
                    transitSteps.length > 1
                ) {
                    console.log(
                        'MULTIPLE TRANSIT LEGS: YES'
                    );
                }
            }
        );

    } catch (error) {

        console.error(
            'Request failed:',
            error.message
        );
    }
}


// --------------------------------------------------
// MAIN
// --------------------------------------------------

async function main() {

    if (!GOOGLE_KEY) {

        console.error(
            'ERROR: GOOGLE_BACKEND_MAPS_KEY is missing from .env'
        );

        process.exit(1);
    }

    console.log(
        '================================================'
    );

    console.log(
        'GOOGLE ROUTES API - MUMBAI METRO COVERAGE TEST'
    );

    console.log(
        '================================================'
    );

    console.log(
        '\nTesting current Google transit data.'
    );

    // --------------------------------------------------
    // TEST 1
    // Direct Red Line:
    // Gundavali → Kashigaon
    //
    // This is the most important test.
    // --------------------------------------------------

    await testRoute(
        'RED LINE: Gundavali → Kashigaon',
        PLACES.gundavali,
        PLACES.kashigaon,
        'FEWER_TRANSFERS'
    );


    // --------------------------------------------------
    // TEST 2
    // Red Line:
    // Gundavali → Poisar
    // --------------------------------------------------

    await testRoute(
        'RED LINE: Gundavali → Poisar',
        PLACES.gundavali,
        PLACES.poisar,
        'FEWER_TRANSFERS'
    );


    // --------------------------------------------------
    // TEST 3
    // Reverse direction:
    // Kashigaon → Gundavali
    // --------------------------------------------------

    await testRoute(
        'RED LINE REVERSE: Kashigaon → Gundavali',
        PLACES.kashigaon,
        PLACES.gundavali,
        'FEWER_TRANSFERS'
    );


    // --------------------------------------------------
    // TEST 4
    // Metro Line 1:
    // Ghatkopar → WEH
    // --------------------------------------------------

    await testRoute(
        'LINE 1: Ghatkopar → WEH',
        PLACES.ghatkopar,
        PLACES.weh,
        'FEWER_TRANSFERS'
    );


    // --------------------------------------------------
    // TEST 5
    // Longer route:
    // Ghatkopar → Poisar
    //
    // Google may choose:
    //
    // Line 1
    // → interchange
    // → Red Line
    //
    // or another combination.
    // --------------------------------------------------

    await testRoute(
        'MULTI-METRO: Ghatkopar → Poisar',
        PLACES.ghatkopar,
        PLACES.poisar,
        'FEWER_TRANSFERS'
    );


    // --------------------------------------------------
    // TEST 6
    // Red Line / Line 7 area → Dahisar East
    //
    // Tests the northern Red Line connection.
    // --------------------------------------------------

    await testRoute(
        'RED LINE: Gundavali → Dahisar East',
        PLACES.gundavali,
        PLACES.dahisarEast,
        'FEWER_TRANSFERS'
    );


    // --------------------------------------------------
    // TEST 7
    // Red Line → Line 2A area.
    //
    // Google decides whether an interchange
    // is useful.
    // --------------------------------------------------

    await testRoute(
        'RED LINE / LINE 2A: Gundavali → Andheri West',
        PLACES.gundavali,
        PLACES.andheriWest,
        'FEWER_TRANSFERS'
    );


    // --------------------------------------------------
    // TEST 8
    // Actual product-style test.
    //
    // Do not bias toward fewer transfers.
    //
    // Let Google choose:
    //
    // WALK
    // BUS
    // METRO
    // TRAIN
    // combinations.
    // --------------------------------------------------

    await testRoute(
        'FULL TRANSIT: Gundavali → Kashigaon',
        PLACES.gundavali,
        PLACES.kashigaon,
        'LESS_WALKING'
    );
    console.log('\n');
    console.log(
        '================================================'
    );

    console.log(
        'ALL GOOGLE TRANSIT TESTS COMPLETE'
    );

    console.log(
        '================================================'
    );
}


main().catch(error => {

    console.error(
        'Fatal error:',
        error
    );

    process.exit(1);
});