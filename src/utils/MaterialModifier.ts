// based on https://github.com/jamieowen/three-material-modifier

import defaultHooks from './defaultHooks';

interface ExtendedMaterial {
    uniforms: Uniforms;
    vertexShader: string;
    fragmentShader: string;
}

interface ShaderExtensionOpts {
    uniforms: { [uniform: string]: any };
    vertexShader: { [pattern: string]: string };
    fragmentShader: { [pattern: string]: string };
    className?: string;
    postModifyVertexShader?: (shader: string) => string;
    postModifyFragmentShader?: (shader: string) => string;
}

interface ShaderExtension extends ShaderExtensionOpts {
    init(material: THREE.Material & ExtendedMaterial): void;
    updateUniforms(time: number, material: THREE.Material & ExtendedMaterial): void
}

const modifySource = ( source: string, hookDefs: {[name: string]: string}, hooks: {[name: string]: string} )=>{
    let match;
    for( let key in hookDefs ){
        if( hooks[key] ){
            match = /insert(before):(.*)|insert(after):(.*)|(replace):(.*)/.exec( hookDefs[key] );

            if( match ){
                if( match[1] ){ // before
                    source = source.replace( match[2], hooks[key] + '\n' + match[2] );
                }else
                if( match[3] ){ // after
                    source = source.replace( match[4], match[4] + '\n' + hooks[key] );
                }else
                if( match[5] ){ // replace
                    source = source.replace( match[6], hooks[key] );
                }
            }
        }
    }

    return source;
}

type Uniforms = {
    [key: string]: any;
}

// copied from three.renderers.shaders.UniformUtils.js
export function cloneUniforms( src: Uniforms ): Uniforms {
	var dst: Uniforms = {};

	for ( var u in src ) {
		dst[ u ] = {} ;
		for ( var p in src[ u ] ) {
			var property = src[ u ][ p ];
			if ( property && ( property.isColor ||
				property.isMatrix3 || property.isMatrix4 ||
				property.isVector2 || property.isVector3 || property.isVector4 ||
				property.isTexture ) ) {
				    dst[ u ][ p ] = property.clone();
			} else if ( Array.isArray( property ) ) {
				dst[ u ][ p ] = property.slice();
			} else {
				dst[ u ][ p ] = property;
			}
		}
	}
	return dst;
}

type SuperClassTypes = typeof THREE.MeshStandardMaterial | typeof THREE.MeshBasicMaterial | typeof THREE.MeshLambertMaterial | typeof THREE.MeshPhongMaterial | typeof THREE.MeshDepthMaterial

type SuperClasses = THREE.MeshStandardMaterial | THREE.MeshBasicMaterial | THREE.MeshLambertMaterial | THREE.MeshPhongMaterial | THREE.MeshDepthMaterial

interface ExtensionData {
    ShaderClass: SuperClassTypes;
    ShaderLib: THREE.Shader;
    Key: string,
    Count: number,
    ModifiedName(): string,
    TypeCheck: string
}

let classMap: {[name: string]: string;} = {
    MeshStandardMaterial: "standard",
    MeshBasicMaterial: "basic",
    MeshLambertMaterial: "lambert",
    MeshPhongMaterial: "phong",
    MeshDepthMaterial: "depth",
    standard: "standard",
    basic: "basic",
    lambert: "lambert",
    phong: "phong",
    depth: "depth"
}

let shaderMap: {[name: string]: ExtensionData;}

const getShaderDef = ( classOrString: SuperClasses | string )=>{

    if( !shaderMap ){

        let classes: {[name: string]: SuperClassTypes;} = {
            standard: THREE.MeshStandardMaterial,
            basic: THREE.MeshBasicMaterial,
            lambert: THREE.MeshLambertMaterial,
            phong: THREE.MeshPhongMaterial,
            depth: THREE.MeshDepthMaterial
        }

        shaderMap = {};

        for( let key in classes ){
            shaderMap[ key ] = {
                ShaderClass: classes[ key ],
                ShaderLib: THREE.ShaderLib[ key ],
                Key: key,
                Count: 0,
                ModifiedName: function(){
                    return `ModifiedMesh${ this.Key[0].toUpperCase() + this.Key.slice(1) }Material_${ ++this.Count }`;
                },
                TypeCheck: `isMesh${ key[0].toUpperCase() + key.slice(1) }Material`
            }
        }
    }

    let shaderDef: ExtensionData | undefined;

    if ( typeof classOrString === 'function' ){
        for( let key in shaderMap ){
            if( shaderMap[ key ].ShaderClass === classOrString ){
                shaderDef = shaderMap[ key ];
                break;
            }
        }
    } else if (typeof classOrString === 'string') {
        let mappedClassOrString = classMap[ classOrString ]
        shaderDef = shaderMap[ mappedClassOrString || classOrString ];
    }

    if( !shaderDef ){
        throw new Error( 'No Shader found to modify...' );
    }

    return shaderDef;
}

/**
 * The main Material Modofier
 */
class MaterialModifier {
    _vertexHooks: {[vertexhook: string]: string}
    _fragmentHooks: {[fragementhook: string]: string}

    constructor( vertexHookDefs: {[name: string]: string}, fragmentHookDefs: {[name: string]: string} ){

        this._vertexHooks = {};
        this._fragmentHooks = {};

        if( vertexHookDefs ){
            this.defineVertexHooks( vertexHookDefs );
        }

        if( fragmentHookDefs ){
            this.defineFragmentHooks( fragmentHookDefs );
        }

    }

    modify( shader: SuperClasses | string, opts: ShaderExtensionOpts ): ExtendedMaterial {

        let def = getShaderDef( shader );

        let vertexShader = modifySource( def.ShaderLib.vertexShader, this._vertexHooks, opts.vertexShader || {} );
        let fragmentShader = modifySource( def.ShaderLib.fragmentShader, this._fragmentHooks, opts.fragmentShader || {} );
        let uniforms = Object.assign( {}, def.ShaderLib.uniforms, opts.uniforms || {} );

        return { vertexShader,fragmentShader,uniforms };

    }

    extend( shader: SuperClasses | string, opts: ShaderExtensionOpts ): { new(): THREE.Material & ExtendedMaterial } {

        let def = getShaderDef( shader ); // ADJUST THIS SHADER DEF - ONLY DEFINE ONCE - AND STORE A USE COUNT ON EXTENDED VERSIONS.

        let vertexShader = modifySource( def.ShaderLib.vertexShader, this._vertexHooks, opts.vertexShader || {} );
        let fragmentShader = modifySource( def.ShaderLib.fragmentShader, this._fragmentHooks, opts.fragmentShader || {} );
        let uniforms = Object.assign( {}, def.ShaderLib.uniforms, opts.uniforms || {} );

        let ClassName = opts.className || def.ModifiedName();

        let extendMaterial = new Function( 'BaseClass', 'uniforms', 'vertexShader', 'fragmentShader', 'cloneUniforms',`

            let cls = class ${ClassName} extends BaseClass {
                constructor( params ){
                    super(params)
    
                    this.uniforms = cloneUniforms( uniforms );
    
                    this.vertexShader = vertexShader;
                    this.fragmentShader = fragmentShader;
                    this.type = '${ClassName}';
    
                    this.setValues( params );
                }
    
                copy( source ){
    
                    super.copy(source );
    
                    this.uniforms = Object.assign( {}, source.uniforms );
                    this.vertexShader = vertexShader;
                    this.fragmentShader = fragmentShader;
                    this.type = '${ClassName}';
    
                    return this;
    
                }
    
            }
            // var cls = function ${ClassName}( params ){

            //     //BaseClass.prototype.constructor.call( this, params );

            //     this.uniforms = cloneUniforms( uniforms );

            //     this.vertexShader = vertexShader;
            //     this.fragmentShader = fragmentShader;
            //     this.type = '${ClassName}';

            //     this.setValues( params );

            // }

            // cls.prototype = Object.create( BaseClass.prototype );
            // cls.prototype.constructor = cls;
            // cls.prototype.${ def.TypeCheck } = true;

            // cls.prototype.copy = function( source ){

            //     BaseClass.prototype.copy.call( this, source );

            //     this.uniforms = Object.assign( {}, source.uniforms );
            //     this.vertexShader = vertexShader;
            //     this.fragmentShader = fragmentShader;
            //     this.type = '${ClassName}';

            //     return this;

            // }

            return cls;

        `);

        if( opts.postModifyVertexShader ){
            vertexShader = opts.postModifyVertexShader( vertexShader );
        }
        if( opts.postModifyFragmentShader ){
            fragmentShader = opts.postModifyFragmentShader( fragmentShader );
        }

        return extendMaterial( def.ShaderClass, uniforms, vertexShader, fragmentShader, cloneUniforms );

    }

    defineVertexHooks( defs: {[name: string]: string} ){

        for( let key in defs ){
            this._vertexHooks[ key ] = defs[key];
        }

    }

    defineFragmentHooks( defs: {[name: string]: string } ) {

        for( let key in defs ){
            this._fragmentHooks[ key ] = defs[key];
        }

    }

}

let defaultMaterialModifier = new MaterialModifier( defaultHooks.vertexHooks, defaultHooks.fragmentHooks );

export { ExtendedMaterial, MaterialModifier, ShaderExtension, ShaderExtensionOpts, defaultMaterialModifier  as DefaultMaterialModifier}