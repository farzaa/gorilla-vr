import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
	75,
	window.innerWidth / window.innerHeight,
	0.1,
	1000,
);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// Add grid helper
const gridHelper = new THREE.GridHelper(100, 20, 0x444444, 0x222222);
scene.add(gridHelper);

// Add axis helper
const axesHelper = new THREE.AxesHelper(10);
scene.add(axesHelper);

// Add axis labels
const createAxisLabel = (text, position, color) => {
	const canvas = document.createElement('canvas');
	canvas.width = 128;
	canvas.height = 64;
	const context = canvas.getContext('2d');
	context.fillStyle = 'rgba(0, 0, 0, 0.5)';
	context.fillRect(0, 0, canvas.width, canvas.height);
	context.font = '24px Arial';
	context.fillStyle = color;
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	context.fillText(text, canvas.width / 2, canvas.height / 2);

	const texture = new THREE.CanvasTexture(canvas);
	const material = new THREE.SpriteMaterial({ map: texture });
	const sprite = new THREE.Sprite(material);
	sprite.position.copy(position);
	sprite.scale.set(5, 2.5, 1);
	scene.add(sprite);
};

createAxisLabel('X', new THREE.Vector3(10, 0, 0), '#ff0000');
createAxisLabel('Y', new THREE.Vector3(0, 10, 0), '#00ff00');
createAxisLabel('Z', new THREE.Vector3(0, 0, 10), '#0000ff');

// Camera and controls setup
camera.position.set(30, 30, 30);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.maxDistance = 100;
controls.minDistance = 10;
controls.update();

// Enhanced lighting
const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
scene.add(ambientLight);

const mainLight = new THREE.DirectionalLight(0xffffff, 2);
mainLight.position.set(10, 10, 10);
mainLight.castShadow = true;
scene.add(mainLight);

const fillLight = new THREE.DirectionalLight(0xffffff, 1);
fillLight.position.set(-10, 5, -10);
scene.add(fillLight);

// Physics world
const world = new CANNON.World({
	gravity: new CANNON.Vec3(0, -9.82, 0),
});

// Ragdoll setup
const createRagdoll = (
	scale = 10,
	position = new CANNON.Vec3(0, 0, 10),
	angleA = Math.PI / 4,
	angleB = Math.PI / 3,
	twistAngle = Math.PI / 8,
) => {
	const bodies = [];
	const constraints = [];
	const group = new THREE.Group();

	const shouldersDistance = 0.5 * scale;
	const upperArmLength = 0.4 * scale;
	const lowerArmLength = 0.4 * scale;
	const upperArmSize = 0.2 * scale;
	const lowerArmSize = 0.2 * scale;
	const neckLength = 0.1 * scale;
	const headRadius = 0.25 * scale;
	const upperBodyLength = 0.6 * scale;
	const pelvisLength = 0.4 * scale;
	const upperLegLength = 0.5 * scale;
	const upperLegSize = 0.2 * scale;
	const lowerLegSize = 0.2 * scale;
	const lowerLegLength = 0.5 * scale;

	// Lower legs
	const lowerLeftLeg = new CANNON.Body({
		mass: 1,
		position: new CANNON.Vec3(-shouldersDistance / 2, lowerLegLength / 2, 0),
	});
	const lowerRightLeg = new CANNON.Body({
		mass: 1,
		position: new CANNON.Vec3(shouldersDistance / 2, lowerLegLength / 2, 0),
	});
	lowerLeftLeg.addShape(
		new CANNON.Box(
			new CANNON.Vec3(
				lowerLegSize * 0.5,
				lowerLegLength * 0.5,
				lowerArmSize * 0.5,
			),
		),
	);
	lowerRightLeg.addShape(
		new CANNON.Box(
			new CANNON.Vec3(
				lowerLegSize * 0.5,
				lowerLegLength * 0.5,
				lowerArmSize * 0.5,
			),
		),
	);
	world.addBody(lowerLeftLeg);
	world.addBody(lowerRightLeg);
	bodies.push(lowerLeftLeg, lowerRightLeg);

	// Upper legs
	const upperLeftLeg = new CANNON.Body({
		mass: 1,
		position: new CANNON.Vec3(
			-shouldersDistance / 2,
			lowerLeftLeg.position.y + lowerLegLength / 2 + upperLegLength / 2,
			0,
		),
	});
	const upperRightLeg = new CANNON.Body({
		mass: 1,
		position: new CANNON.Vec3(
			shouldersDistance / 2,
			lowerRightLeg.position.y + lowerLegLength / 2 + upperLegLength / 2,
			0,
		),
	});
	upperLeftLeg.addShape(
		new CANNON.Box(
			new CANNON.Vec3(
				upperLegSize * 0.5,
				upperLegLength * 0.5,
				lowerArmSize * 0.5,
			),
		),
	);
	upperRightLeg.addShape(
		new CANNON.Box(
			new CANNON.Vec3(
				upperLegSize * 0.5,
				upperLegLength * 0.5,
				lowerArmSize * 0.5,
			),
		),
	);
	world.addBody(upperLeftLeg);
	world.addBody(upperRightLeg);
	bodies.push(upperLeftLeg, upperRightLeg);

	// Pelvis
	const pelvis = new CANNON.Body({
		mass: 1,
		position: new CANNON.Vec3(
			0,
			upperLeftLeg.position.y + upperLegLength / 2 + pelvisLength / 2,
			0,
		),
	});
	pelvis.addShape(
		new CANNON.Box(
			new CANNON.Vec3(
				shouldersDistance * 0.5,
				pelvisLength * 0.5,
				lowerArmSize * 0.5,
			),
		),
	);
	world.addBody(pelvis);
	bodies.push(pelvis);

	// Upper body
	const upperBody = new CANNON.Body({
		mass: 1,
		position: new CANNON.Vec3(
			0,
			pelvis.position.y + pelvisLength / 2 + upperBodyLength / 2,
			0,
		),
	});
	upperBody.addShape(
		new CANNON.Box(
			new CANNON.Vec3(
				shouldersDistance * 0.5,
				upperBodyLength * 0.5,
				lowerArmSize * 0.5,
			),
		),
	);
	world.addBody(upperBody);
	bodies.push(upperBody);

	// Head
	const head = new CANNON.Body({
		mass: 1,
		position: new CANNON.Vec3(
			0,
			upperBody.position.y + upperBodyLength / 2 + headRadius + neckLength,
			0,
		),
	});
	head.addShape(new CANNON.Sphere(headRadius));
	world.addBody(head);
	bodies.push(head);

	// Upper arms
	const upperLeftArm = new CANNON.Body({
		mass: 1,
		position: new CANNON.Vec3(
			-shouldersDistance / 2 - upperArmLength / 2,
			upperBody.position.y + upperBodyLength / 2,
			0,
		),
	});
	const upperRightArm = new CANNON.Body({
		mass: 1,
		position: new CANNON.Vec3(
			shouldersDistance / 2 + upperArmLength / 2,
			upperBody.position.y + upperBodyLength / 2,
			0,
		),
	});
	upperLeftArm.addShape(
		new CANNON.Box(
			new CANNON.Vec3(
				upperArmLength * 0.5,
				upperArmSize * 0.5,
				upperArmSize * 0.5,
			),
		),
	);
	upperRightArm.addShape(
		new CANNON.Box(
			new CANNON.Vec3(
				upperArmLength * 0.5,
				upperArmSize * 0.5,
				upperArmSize * 0.5,
			),
		),
	);
	world.addBody(upperLeftArm);
	world.addBody(upperRightArm);
	bodies.push(upperLeftArm, upperRightArm);

	// Lower arms
	const lowerLeftArm = new CANNON.Body({
		mass: 1,
		position: new CANNON.Vec3(
			upperLeftArm.position.x - lowerArmLength / 2 - upperArmLength / 2,
			upperLeftArm.position.y,
			0,
		),
	});
	const lowerRightArm = new CANNON.Body({
		mass: 1,
		position: new CANNON.Vec3(
			upperRightArm.position.x + lowerArmLength / 2 + upperArmLength / 2,
			upperRightArm.position.y,
			0,
		),
	});
	lowerLeftArm.addShape(
		new CANNON.Box(
			new CANNON.Vec3(
				lowerArmLength * 0.5,
				lowerArmSize * 0.5,
				lowerArmSize * 0.5,
			),
		),
	);
	lowerRightArm.addShape(
		new CANNON.Box(
			new CANNON.Vec3(
				lowerArmLength * 0.5,
				lowerArmSize * 0.5,
				lowerArmSize * 0.5,
			),
		),
	);
	world.addBody(lowerLeftArm);
	world.addBody(lowerRightArm);
	bodies.push(lowerLeftArm, lowerRightArm);

	// Create visual meshes
	bodies.forEach((body, index) => {
		const shape = body.shapes[0];
		let mesh;
		let color;

		// Set color based on body part
		if (index === 6) {
			// Head
			color = 0xff0000; // Red
		} else if (index === 5) {
			// Upper body
			color = 0xff0000; // Red
		} else if (index === 4) {
			// Pelvis
			color = 0x000000; // Black
		} else if (index === 2 || index === 3) {
			// Upper legs
			color = 0x000000; // Black
		} else {
			// Lower legs and arms
			color = 0xffcca8; // Skin color
		}

		if (shape instanceof CANNON.Sphere) {
			mesh = new THREE.Mesh(
				new THREE.SphereGeometry(shape.radius),
				new THREE.MeshStandardMaterial({
					color: color,
					roughness: 0.7,
					metalness: 0.3,
				}),
			);
		} else if (shape instanceof CANNON.Box) {
			mesh = new THREE.Mesh(
				new THREE.BoxGeometry(
					shape.halfExtents.x * 2,
					shape.halfExtents.y * 2,
					shape.halfExtents.z * 2,
				),
				new THREE.MeshStandardMaterial({
					color: color,
					roughness: 0.7,
					metalness: 0.3,
				}),
			);
		}

		if (mesh) {
			mesh.castShadow = true;
			mesh.receiveShadow = true;
			group.add(mesh);
		}
	});

	// Neck joint
	const neckJoint = new CANNON.ConeTwistConstraint(head, upperBody, {
		pivotA: new CANNON.Vec3(0, -headRadius - neckLength / 2, 0),
		pivotB: new CANNON.Vec3(0, upperBodyLength / 2, 0),
		axisA: CANNON.Vec3.UNIT_Y,
		axisB: CANNON.Vec3.UNIT_Y,
		angle: angleA,
		twistAngle: twistAngle,
	});
	world.addConstraint(neckJoint);
	constraints.push(neckJoint);

	// Knee joints
	const leftKneeJoint = new CANNON.ConeTwistConstraint(
		lowerLeftLeg,
		upperLeftLeg,
		{
			pivotA: new CANNON.Vec3(0, lowerLegLength / 2, 0),
			pivotB: new CANNON.Vec3(0, -upperLegLength / 2, 0),
			axisA: CANNON.Vec3.UNIT_Y,
			axisB: CANNON.Vec3.UNIT_Y,
			angle: angleA,
			twistAngle: twistAngle,
		},
	);
	const rightKneeJoint = new CANNON.ConeTwistConstraint(
		lowerRightLeg,
		upperRightLeg,
		{
			pivotA: new CANNON.Vec3(0, lowerLegLength / 2, 0),
			pivotB: new CANNON.Vec3(0, -upperLegLength / 2, 0),
			axisA: CANNON.Vec3.UNIT_Y,
			axisB: CANNON.Vec3.UNIT_Y,
			angle: angleA,
			twistAngle: twistAngle,
		},
	);
	world.addConstraint(leftKneeJoint);
	world.addConstraint(rightKneeJoint);
	constraints.push(leftKneeJoint, rightKneeJoint);

	// Hip joints
	const leftHipJoint = new CANNON.ConeTwistConstraint(upperLeftLeg, pelvis, {
		pivotA: new CANNON.Vec3(0, upperLegLength / 2, 0),
		pivotB: new CANNON.Vec3(-shouldersDistance / 2, -pelvisLength / 2, 0),
		axisA: CANNON.Vec3.UNIT_Y,
		axisB: CANNON.Vec3.UNIT_Y,
		angle: angleA,
		twistAngle: twistAngle,
	});
	const rightHipJoint = new CANNON.ConeTwistConstraint(upperRightLeg, pelvis, {
		pivotA: new CANNON.Vec3(0, upperLegLength / 2, 0),
		pivotB: new CANNON.Vec3(shouldersDistance / 2, -pelvisLength / 2, 0),
		axisA: CANNON.Vec3.UNIT_Y,
		axisB: CANNON.Vec3.UNIT_Y,
		angle: angleA,
		twistAngle: twistAngle,
	});
	world.addConstraint(leftHipJoint);
	world.addConstraint(rightHipJoint);
	constraints.push(leftHipJoint, rightHipJoint);

	// Spine
	const spineJoint = new CANNON.ConeTwistConstraint(pelvis, upperBody, {
		pivotA: new CANNON.Vec3(0, pelvisLength / 2, 0),
		pivotB: new CANNON.Vec3(0, -upperBodyLength / 2, 0),
		axisA: CANNON.Vec3.UNIT_Y,
		axisB: CANNON.Vec3.UNIT_Y,
		angle: angleA,
		twistAngle: twistAngle,
	});
	world.addConstraint(spineJoint);
	constraints.push(spineJoint);

	// Shoulders
	const leftShoulder = new CANNON.ConeTwistConstraint(upperBody, upperLeftArm, {
		pivotA: new CANNON.Vec3(-shouldersDistance / 2, upperBodyLength / 2, 0),
		pivotB: new CANNON.Vec3(upperArmLength / 2, 0, 0),
		axisA: CANNON.Vec3.UNIT_X,
		axisB: CANNON.Vec3.UNIT_X,
		angle: angleB,
	});
	const rightShoulder = new CANNON.ConeTwistConstraint(
		upperBody,
		upperRightArm,
		{
			pivotA: new CANNON.Vec3(shouldersDistance / 2, upperBodyLength / 2, 0),
			pivotB: new CANNON.Vec3(-upperArmLength / 2, 0, 0),
			axisA: CANNON.Vec3.UNIT_X,
			axisB: CANNON.Vec3.UNIT_X,
			angle: angleB,
			twistAngle: twistAngle,
		},
	);
	world.addConstraint(leftShoulder);
	world.addConstraint(rightShoulder);
	constraints.push(leftShoulder, rightShoulder);

	// Elbow joints
	const leftElbowJoint = new CANNON.ConeTwistConstraint(
		lowerLeftArm,
		upperLeftArm,
		{
			pivotA: new CANNON.Vec3(lowerArmLength / 2, 0, 0),
			pivotB: new CANNON.Vec3(-upperArmLength / 2, 0, 0),
			axisA: CANNON.Vec3.UNIT_X,
			axisB: CANNON.Vec3.UNIT_X,
			angle: angleA,
			twistAngle: twistAngle,
		},
	);
	const rightElbowJoint = new CANNON.ConeTwistConstraint(
		lowerRightArm,
		upperRightArm,
		{
			pivotA: new CANNON.Vec3(-lowerArmLength / 2, 0, 0),
			pivotB: new CANNON.Vec3(upperArmLength / 2, 0, 0),
			axisA: CANNON.Vec3.UNIT_X,
			axisB: CANNON.Vec3.UNIT_X,
			angle: angleA,
			twistAngle: twistAngle,
		},
	);
	world.addConstraint(leftElbowJoint);
	world.addConstraint(rightElbowJoint);
	constraints.push(leftElbowJoint, rightElbowJoint);

	// Move all body parts to final position
	bodies.forEach((body) => {
		body.position.set(
			position.x + body.position.x,
			position.y + body.position.y,
			position.z + body.position.z,
		);
	});

	return {
		bodies,
		constraints,
		group,
	};
};

// Create ground
const groundShape = new CANNON.Plane();
const groundMaterial = new CANNON.Material({ friction: 0.5, restitution: 0.1 });
const groundBody = new CANNON.Body({
	mass: 0,
	material: groundMaterial,
});
groundBody.addShape(groundShape);
groundBody.position.set(0, -1, 0);
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(groundBody);

// Create ground mesh
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterialMesh = new THREE.MeshStandardMaterial({
	color: 0x808080,
	roughness: 0.8,
	metalness: 0.2,
});
const groundMesh = new THREE.Mesh(groundGeometry, groundMaterialMesh);
groundMesh.rotation.x = -Math.PI / 2;
groundMesh.position.y = -1;
groundMesh.receiveShadow = true;
scene.add(groundMesh);

// Create static sphere
const sphereShape = new CANNON.Sphere(4);
const sphereBody = new CANNON.Body({ mass: 0 });
sphereBody.addShape(sphereShape);
sphereBody.position.set(0, -1, 0);
world.addBody(sphereBody);

// Create sphere mesh
const sphereGeometry = new THREE.SphereGeometry(4);
const sphereMaterial = new THREE.MeshStandardMaterial({
	color: 0x808080,
	roughness: 0.5,
	metalness: 0.5,
});
const sphereMesh = new THREE.Mesh(sphereGeometry, sphereMaterial);
sphereMesh.position.copy(sphereBody.position);
scene.add(sphereMesh);

// Create mouse-following cube
const cubeSize = 10;
const mouseCubeGeometry = new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize);
const mouseCubeMaterial = new THREE.MeshStandardMaterial({
	color: 0xff0000,
	transparent: true,
	opacity: 0.7,
});
const mouseCube = new THREE.Mesh(mouseCubeGeometry, mouseCubeMaterial);
scene.add(mouseCube);

// Create physics body for the cube
const cubeShape = new CANNON.Box(
	new CANNON.Vec3(cubeSize / 2, cubeSize / 2, cubeSize / 2),
);
const cubeBody = new CANNON.Body({
	mass: 1,
	shape: cubeShape,
	type: CANNON.Body.KINEMATIC,
});
world.addBody(cubeBody);

// Function to update cube position based on mouse
function updateMouseCube() {
	raycaster.setFromCamera(mouse, camera);
	const intersection = new THREE.Vector3();
	if (raycaster.ray.intersectPlane(groundPlane, intersection)) {
		// Add some height to keep the cube above ground
		intersection.y += cubeSize / 2;
		mouseCube.position.copy(intersection);
		cubeBody.position.copy(intersection);
	}
}

// Function to check collision between cube and character
function checkCubeCharacterCollision() {
	if (!character || character.isRagdollEnabled()) return;

	const cubeBox = new THREE.Box3().setFromObject(mouseCube);
	const characterBox = new THREE.Box3().setFromObject(character.group);

	if (cubeBox.intersectsBox(characterBox)) {
		// Get the character's current position and rotation
		const charPosition = new CANNON.Vec3(
			character.group.position.x,
			character.group.position.y,
			character.group.position.z,
		);

		// Create a new ragdoll at the character's position with 9x scale
		const newRagdoll = createRagdoll(9, charPosition);
		scene.add(newRagdoll.group);
		ragdolls.push(newRagdoll);

		// Remove the character model from the scene
		scene.remove(character.group);
		world.removeBody(character.physicsBody);

		// Apply some random forces to make it look more dynamic
		newRagdoll.bodies.forEach((body) => {
			const force = new CANNON.Vec3(
				(Math.random() - 0.5) * 900, // Increased force to match larger size
				Math.random() * 900, // Increased force to match larger size
				(Math.random() - 0.5) * 900, // Increased force to match larger size
			);
			body.applyForce(force, body.position);
		});

		// Disable the character
		character.enableRagdoll();
	}
}

// Create character
const createCharacter = () => {
	const characterGroup = new THREE.Group();
	let mixer = null;
	let walkAction = null;
	let punchAction = null;
	let walkClip = null;
	let punchClip = null;
	let ragdollBodies = null;
	let modelBones = {};
	let isRagdoll = false;

	// Create a separate physics body for walking
	const walkingBody = new CANNON.Body({
		mass: 50,
		position: new CANNON.Vec3(6, 0, 0),
		shape: new CANNON.Box(new CANNON.Vec3(0.5, 1, 0.5)), // Scaled down to match model
		material: new CANNON.Material({ friction: 0.1, restitution: 0.1 }),
	});

	walkingBody.fixedRotation = true;
	walkingBody.angularDamping = 0.9;
	walkingBody.linearDamping = 0.5;
	walkingBody.type = CANNON.Body.KINEMATIC;

	world.addBody(walkingBody);

	// Define bone mapping outside the loader callback
	const bodyToBonesMap = {
		0: ['mixamorigLeftLeg'], // Lower Left Leg
		1: ['mixamorigRightLeg'], // Lower Right Leg
		2: ['mixamorigLeftUpLeg'], // Upper Left Leg
		3: ['mixamorigRightUpLeg'], // Upper Right Leg
		4: ['mixamorigHips'], // Pelvis
		5: ['mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2'], // Upper Body
		6: ['mixamorigHead'], // Head
		7: ['mixamorigLeftArm'], // Upper Left Arm
		8: ['mixamorigRightArm'], // Upper Right Arm
		9: ['mixamorigLeftForeArm'], // Lower Left Arm
		10: ['mixamorigRightForeArm'], // Lower Right Arm
	};

	// Create the ragdoll physics bodies but keep them disabled
	const ragdoll = createRagdoll(
		1,
		walkingBody.position.clone(),
		Math.PI / 6,
		Math.PI / 4,
		Math.PI / 8,
	);
	ragdollBodies = ragdoll.bodies;

	// Initially disable all ragdoll bodies and adjust their properties
	const ragdollMaterial = new CANNON.Material({
		friction: 0.5,
		restitution: 0.1,
	});
	ragdollBodies.forEach((body) => {
		body.sleep();
		body.type = CANNON.Body.STATIC;
		body.angularDamping = 0.99;
		body.linearDamping = 0.98;
		body.material = ragdollMaterial;
	});

	// Add contact material for ragdoll-ground interaction
	const ragdollGroundContact = new CANNON.ContactMaterial(
		groundMaterial,
		ragdollMaterial,
		{
			friction: 0.5,
			restitution: 0.1,
			contactEquationStiffness: 1e6,
			contactEquationRelaxation: 3,
		},
	);
	world.addContactMaterial(ragdollGroundContact);

	let model = null;

	// Function to load an animation
	const loadAnimation = (filename) => {
		return new Promise((resolve, reject) => {
			const fbxLoader = new FBXLoader();
			fbxLoader.load(
				filename,
				(fbx) => resolve(fbx.animations[0]),
				undefined,
				reject,
			);
		});
	};

	// Load character model and animations
	const fbxLoader = new FBXLoader();
	fbxLoader.load(
		'assets/Walking.fbx',
		async (baseModel) => {
			model = baseModel;
			model.scale.setScalar(0.1);
			characterGroup.add(model);

			// DEBUG: Print all bone names
			console.log('Available bones in the model:');
			model.traverse((node) => {
				if (node.isBone) {
					console.log(node.name);
					modelBones[node.name.toLowerCase()] = node;
				}
			});

			// Setup animation mixer
			mixer = new THREE.AnimationMixer(model);

			try {
				// Load both animations
				walkClip = model.animations[0];
				punchClip = await loadAnimation('assets/Punching.fbx');

				// Clean up the animations to remove root motion
				const cleanWalkClip = THREE.AnimationClip.parse(
					THREE.AnimationClip.toJSON(walkClip),
				);
				cleanWalkClip.tracks = cleanWalkClip.tracks.filter(
					(track) =>
						!track.name.toLowerCase().includes('position') &&
						!track.name.toLowerCase().includes('translation'),
				);

				const cleanPunchClip = THREE.AnimationClip.parse(
					THREE.AnimationClip.toJSON(punchClip),
				);
				cleanPunchClip.tracks = cleanPunchClip.tracks.filter(
					(track) =>
						!track.name.toLowerCase().includes('position') &&
						!track.name.toLowerCase().includes('translation'),
				);

				// Create animation actions
				walkAction = mixer.clipAction(cleanWalkClip);
				punchAction = mixer.clipAction(cleanPunchClip);

				// Set up animation properties
				walkAction.enabled = false;
				punchAction.enabled = false;
				punchAction.loop = THREE.LoopRepeat;

				// Crossfade between animations
				walkAction.clampWhenFinished = true;
				punchAction.clampWhenFinished = true;
			} catch (error) {
				console.error('Error loading animations:', error);
			}

			// Add click detection for the model
			const raycaster = new THREE.Raycaster();
			window.addEventListener('click', (event) => {
				if (isRagdoll) return;

				const mouse = new THREE.Vector2(
					(event.clientX / window.innerWidth) * 2 - 1,
					-(event.clientY / window.innerHeight) * 2 + 1,
				);

				raycaster.setFromCamera(mouse, camera);
				const intersects = raycaster.intersectObject(model, true);

				if (intersects.length > 0) {
					enableRagdoll();
				}
			});
		},
		(xhr) => {
			console.log((xhr.loaded / xhr.total) * 100 + '% loaded');
		},
		(error) => {
			console.error('Error loading FBX:', error);
		},
	);

	scene.add(characterGroup);

	// Function to enable ragdoll physics
	const enableRagdoll = () => {
		if (isRagdoll) return;
		isRagdoll = true;

		// Stop all animations
		if (walkAction) walkAction.stop();
		if (punchAction) punchAction.stop();

		// Remove walking body
		world.removeBody(walkingBody);

		// Enable physics on all ragdoll bodies
		ragdollBodies.forEach((body) => {
			body.wakeUp();
			body.type = CANNON.Body.DYNAMIC;

			const bone =
				modelBones[
					bodyToBonesMap[ragdollBodies.indexOf(body)][0].toLowerCase()
				];
			if (bone) {
				const worldPosition = new THREE.Vector3();
				const worldQuaternion = new THREE.Quaternion();
				bone.getWorldPosition(worldPosition);
				bone.getWorldQuaternion(worldQuaternion);

				body.position.copy(worldPosition);
				body.quaternion.copy(worldQuaternion);
				body.velocity.set(
					(Math.random() - 0.5) * 2,
					0,
					(Math.random() - 0.5) * 2,
				);
			}
		});
	};

	// Function to switch animations with crossfade
	const switchAnimation = (from, to, duration = 0.2) => {
		if (!from || !to) return;

		to.enabled = true;
		to.setEffectiveTimeScale(1);
		to.setEffectiveWeight(1);
		to.crossFadeFrom(from, duration, true);
		to.play();
	};

	return {
		group: characterGroup,
		physicsBody: walkingBody,
		bodies: ragdollBodies,
		constraints: ragdoll.constraints,
		getMixer: () => mixer,
		getWalkAction: () => walkAction,
		getPunchAction: () => punchAction,
		switchToPunch: () => switchAnimation(walkAction, punchAction),
		switchToWalk: () => switchAnimation(punchAction, walkAction),
		isRagdollEnabled: () => isRagdoll,
		enableRagdoll: enableRagdoll,
		updatePhysics: () => {
			if (!isRagdoll) {
				characterGroup.position.copy(walkingBody.position);
			} else if (ragdollBodies) {
				ragdollBodies.forEach((body, i) => {
					const boneNames = bodyToBonesMap[i] || [];
					boneNames.forEach((boneName) => {
						const bone = modelBones[boneName.toLowerCase()];
						if (bone) {
							bone.position.copy(body.position);
							bone.quaternion.copy(body.quaternion);
						}
					});
				});
			}
		},
	};
};

// Create the character
const character = createCharacter();

// Character movement variables
let targetPosition = new THREE.Vector3(0, 0, 0);
const moveSpeed = 0.1;
let isMoving = false;

// Create raycaster
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Create ground plane for raycasting
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

// Handle mouse movement
window.addEventListener('mousemove', (event) => {
	// Calculate mouse position in normalized device coordinates
	mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
	mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
});

// Handle mouse click
window.addEventListener('click', () => {
	// Update raycaster
	raycaster.setFromCamera(mouse, camera);

	// Calculate intersection with ground plane
	const intersection = new THREE.Vector3();
	if (raycaster.ray.intersectPlane(groundPlane, intersection)) {
		targetPosition.copy(intersection);
		isMoving = true;
	}
});

// Create multiple ragdolls
const ragdolls = [];
const NUM_RAGDOLLS = 0; // Changed to 0 to prevent initial ragdoll spawning
const SPAWN_HEIGHT = 20;
const MAP_SIZE = 100; // Size of the map area
const MIN_SPACING = 5; // Minimum distance between ragdolls

function getRandomPosition() {
	// Generate random position within the map area
	const x = (Math.random() - 0.5) * MAP_SIZE;
	const z = (Math.random() - 0.5) * MAP_SIZE;
	const y = SPAWN_HEIGHT + (Math.random() - 0.5) * 2; // Small random height variation

	return new CANNON.Vec3(x, y, z);
}

function getRandomRotation() {
	return new CANNON.Vec3(
		Math.random() * Math.PI * 2,
		Math.random() * Math.PI * 2,
		Math.random() * Math.PI * 2,
	);
}

// Create ragdolls with random positions
for (let i = 0; i < NUM_RAGDOLLS; i++) {
	const position = getRandomPosition();
	const ragdoll = createRagdoll(10, position);

	// Apply random initial rotation to each body
	const rotation = getRandomRotation();
	ragdoll.bodies.forEach((body) => {
		body.quaternion.setFromEuler(rotation.x, rotation.y, rotation.z);
		body.velocity.set(0, 0, 0);
		body.angularVelocity.set(0, 0, 0);
	});

	scene.add(ragdoll.group);
	ragdolls.push(ragdoll);
}

// Update the animation loop
function animate(time, frame) {
	const deltaTime = 1 / 60;

	// Update cube position
	updateMouseCube();

	// Check for collision
	checkCubeCharacterCollision();

	world.step(deltaTime);

	if (!character.isRagdollEnabled()) {
		if (isMoving) {
			const currentPosition = new THREE.Vector3(
				character.physicsBody.position.x,
				0,
				character.physicsBody.position.z,
			);
			const direction = new THREE.Vector3()
				.subVectors(targetPosition, currentPosition)
				.normalize();

			const distance = currentPosition.distanceTo(targetPosition);

			if (distance > 1) {
				const maxSpeed = 20;
				const targetVelocity = new CANNON.Vec3(
					direction.x * maxSpeed,
					0,
					direction.z * maxSpeed,
				);

				character.physicsBody.velocity.x = targetVelocity.x;
				character.physicsBody.velocity.y = 0;
				character.physicsBody.velocity.z = targetVelocity.z;

				character.group.rotation.y = Math.atan2(direction.x, direction.z);

				// Switch to walking animation if not already walking
				if (
					character.getWalkAction() &&
					!character.getWalkAction().isRunning()
				) {
					character.switchToWalk();
					character.getWalkAction().timeScale = 1.5;
				}
			} else {
				character.physicsBody.velocity.set(0, 0, 0);
				isMoving = false;

				// Switch to punching animation when reaching destination
				if (character.getPunchAction()) {
					character.switchToPunch();
				}
			}
		}

		character.group.position.copy(character.physicsBody.position);
	}
	character.updatePhysics();

	if (character.getMixer()) {
		character.getMixer().update(deltaTime);
	}

	ragdolls.forEach((ragdoll) => {
		ragdoll.bodies.forEach((body, i) => {
			ragdoll.group.children[i].position.copy(body.position);
			ragdoll.group.children[i].quaternion.copy(body.quaternion);
		});
	});

	renderer.render(scene, camera);
}

// Set up animation loop
renderer.setAnimationLoop(animate);

// Handle window resize
window.addEventListener('resize', () => {
	camera.aspect = window.innerWidth / window.innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(window.innerWidth, window.innerHeight);
});
