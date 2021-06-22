import '../systems/fader-plus.js'
import '../components/portal.js'
import '../components/immersive-360.js'
import '../components/parallax.js'
import '../components/html-script.js'
import '../components/region-hider.js'

AFRAME.GLTFModelPlus.registerComponent('immersive-360', 'immersive-360')
AFRAME.GLTFModelPlus.registerComponent('portal', 'portal')
AFRAME.GLTFModelPlus.registerComponent('parallax', 'parallax')
AFRAME.GLTFModelPlus.registerComponent('html-script', 'html-script')
AFRAME.GLTFModelPlus.registerComponent('region-hider', 'region-hider')

// do a simple monkey patch to see if it works

// var myisMineOrLocal = function (that) {
//     return !that.el.components.networked || (that.networkedEl && NAF.utils.isMine(that.networkedEl));
//  }

//  var videoComp = AFRAME.components["media-video"]
//  videoComp.Component.prototype.isMineOrLocal = myisMineOrLocal;

// add the region-hider to the scene
const scene = document.querySelector("a-scene");
scene.setAttribute("region-hider", {size: 100})