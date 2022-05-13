// experimental data logging:
// - monitor user location and then log when the nearest waypoint changes
// - log when the user enters a portal
// - clicking a link (hubs link or vue-app link) ... actually can't do hubs link?
// - when the user enters a new scene, or a new gallery in a scene via a portal
// - click on a forcegraph
// - move in or out of a panoball
// 
// for each log entry
// - log the user id
// - log the time
// - log the event name
// - log the user location (closest waypoint)
// - log the room id (number or string)
// - log the portal, link, or target scene for interaction or navigation

// events:
// - waypoint-changed
// - portal-entered
// - room-entered
// - content-clicked
// - link-clicked
// - forcegraph-clicked
// - panoball-entered
// - panoball-exited

let DIST_THRESHOLD = 0.5;

let worldCam = new THREE.Vector3()
let worldWaypoint = new THREE.Vector3()

let oldWindowOpen = window.open;

AFRAME.registerSystem('data-logging', {
    init: function () {
        this.id = -1;
        this.room = "";
        this.waypoint = -1;
        this.waypointName = "";
        this.waypointDistance = Number.MAX_SAFE_INTEGER;

        // log window.open events
        this.logOpenAndOpen = this.logOpenAndOpen.bind(this)
        window.open = this.logOpenAndOpen;

        waitForDOMContentLoaded().then(() => {
            setTimeout(() => {
                // want to let other domcontentloaded events to finish
                // before we run, so SSO is set up (if it will be)
                this.finishInit()
            },1);
        });
    },
    
    logOpenAndOpen: async function (url, target, windowFeatures) {
        await this.logOpen(target, url);
        oldWindowOpen(url,target,windowFeatures);
    },

    finishInit: async function () {
        this.portal = this.el.systems['portal'];
        this.waypoints = this.el.systems["hubs-systems"].waypointSystem;
        this.camera = document.getElementById("viewing-camera").object3DMap.camera;

        // if we are running on realitymedia.digital, this will be set.  IF we are not,
        // it won't be set, so just back out
        if (!window.SSO) {
            return
        }

        await this.portal.waitForRoomId()

        this.id = window.SSO.userInfo.user.id;
        this.room = this.portal.roomData.roomId >= 0 ? this.portal.roomData.roomId : window.APP.hubChannel.hubId;

        if (this.waypoints.ready) {
            let {nearest, nearestDist} = this.updateNearestWaypoint();
            this.waypoint = nearest;
            this.waypointName = nearest >= 0 ? this.waypoints.waypoints[nearest].name : "";
            this.waypointDistance = nearestDist;
        }
        this.logEvent("room-entered");
    },

    //  send log with:
    //  id==this.id
    //  event==eventName,
    //  timestamp,
    //  location=waypointName,
    //  room=this.room,
    //  param1 (optional)
    //  param2 (optional)

    logEvent: async function (eventName, param1, param2) {
        if (this.id <= 0) {
            console.log("can't log event '" + eventName + "', user ID unknown.")
            return;
        }
        const options = {};
        options.headers = new Headers();
        options.headers.set("Content-Type", "application/json");
        options.credentials = "include"; // use cookie
        var url = "https://realitymedia.digital/logging/log/?";
            url += "id=" + encodeURIComponent(this.id);
            url += "&room=" + encodeURIComponent(this.room);
            url += "&event=" + encodeURIComponent(eventName); 
            url += "&timestamp=" + encodeURIComponent(Date.now()); 
            url += "&location=" + encodeURIComponent(this.waypointName); 
            url += "&param1=" + (param1 ? encodeURIComponent(param1) : "");
            url += "&param2=" + (param2 ? encodeURIComponent(param2) : ""); 
        console.log("Logging: " + url);
        url += "&token=" + 
            encodeURIComponent(window.APP.store.state.credentials.token);
        await fetch(url, options)
            .then(response => response.json())
            .then(data => {
                console.log('Log reply:', data.message);
        })
    },

    logClick: async function (param1, param2) {
        await this.logEvent("content-clicked", param1, param2);
    },
    logPortal: async function (param1, param2) {
        await this.logEvent("portal-entered", param1, param2);
    },
    logPanoballEntered: async function (param1, param2) {
        await this.logEvent("panoball-entered", param1, param2);
    },
    logPanoballExited: async function (param1, param2) {
        await this.logEvent("panoball-exited", param1, param2);
    },
    logLink: async function (param1, param2) {
        await this.logEvent("link-clicked", param1, param2);
    },
    logOpen: async function (param1, param2) {
        await this.logEvent("link-open", param1, param2);
    },
    logForcegraph: async function (param1, param2) {
        await this.logEvent("forcegraph-clicked", param1, param2);
    },

    getNearestWaypoint: function () {   
        return this.waypoints.ready[this.waypoint].el;
    },

    updateNearestWaypoint: function () {
        let nearest = -1;
        let nearestDist = Number.MAX_SAFE_INTEGER;

        this.camera.updateMatrices();
        worldCam.setFromMatrixPosition(this.camera.matrixWorld);

        for (let i = 0; i < this.waypoints.ready.length; i++) {
            let waypoint = this.waypoints.ready[i].el;

            waypoint.object3D.updateMatrices();
            worldWaypoint.setFromMatrixPosition(waypoint.object3D.matrixWorld)
            let distance = worldWaypoint.distanceTo(worldCam);
            if (distance < nearestDist) {
                nearest = i;
                nearestDist = distance;
            }
            if (i == this.waypoint) {
                this.waypointDistance = distance;
            }
        }
        return {nearest, nearestDist};
    },

    tick(t, dt) {
        // waypoints are in waypoints.ready
        if (this.waypoints && this.waypoints.ready) {
            let {nearest, nearestDist} = this.updateNearestWaypoint();
            if (nearest != this.waypoint && nearestDist + DIST_THRESHOLD < this.waypointDistance) {
                this.waypoint = nearest;
                this.waypointName = this.waypoints.ready[this.waypoint].el.object3D.name;
                this.waypointDistance = nearestDist;
                this.logEvent("waypoint-changed");
            }
        }
    }
});
