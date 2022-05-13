import '../systems/fader-plus.js'
import '../systems/data-logging.js'
import '../components/portal.js'
import '../components/immersive-360.js'
import '../components/parallax.js'
import '../components/shader.ts'
import '../components/html-script.js'
import '../components/region-hider.js'
import '../components/video-control-pad'
import '../components/three-sample.js'
import "../components/force-graph.js"
import "../components/show-hide.js"
import "../components/mirror.js"

import "https://www.aelatgt.org/avatar-webkit-hubs/room.js"

AFRAME.GLTFModelPlus.registerComponent('immersive-360', 'immersive-360');
AFRAME.GLTFModelPlus.registerComponent('portal', 'portal');
AFRAME.GLTFModelPlus.registerComponent('shader', 'shader');
AFRAME.GLTFModelPlus.registerComponent('parallax', 'parallax');
AFRAME.GLTFModelPlus.registerComponent('html-script', 'html-script');
AFRAME.GLTFModelPlus.registerComponent('region-hider', 'region-hider');
AFRAME.GLTFModelPlus.registerComponent('video-control-pad', 'video-control-pad');
AFRAME.GLTFModelPlus.registerComponent('show-hide', 'show-hide');
AFRAME.GLTFModelPlus.registerComponent('test-cube', 'test-cube');
AFRAME.GLTFModelPlus.registerComponent('force-graph', 'force-graph');
AFRAME.GLTFModelPlus.registerComponent('mirror', 'mirror');

// do a simple monkey patch to see if it works

// var myisMineOrLocal = function (that) {
//     return !that.el.components.networked || (that.networkedEl && NAF.utils.isMine(that.networkedEl));
//  }

//  var videoComp = AFRAME.components["media-video"]
//  videoComp.Component.prototype.isMineOrLocal = myisMineOrLocal;

// let homePageDesc = document.querySelector('[class^="HomePage__app-description"]')
// if (homePageDesc) {
//     homePageDesc.innerHTML = "Reality Media Immersive Experience<br><br>After signing in, visit <a href='https://realitymedia.digital'>realitymedia.digital</a> to get started"
// }


function hideLobbySphere() {
    // @ts-ignore
    window.APP.scene.addEventListener('stateadded', function(evt:CustomEvent) { 
        if (evt.detail === 'entered') {
            // @ts-ignore
            var lobbySphere = window.APP.scene.object3D.getObjectByName('lobbySphere')
            if (lobbySphere) {
                lobbySphere.visible = false
            }
        }
    });
}

if (document.readyState === 'complete') {
    hideLobbySphere();
} else {
    document.addEventListener('DOMContentLoaded', hideLobbySphere);
}