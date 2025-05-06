/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import * as CANNON from 'cannon-es';
import * as THREE from 'three';

import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Text } from 'troika-three-text';
import { XR_BUTTONS } from 'gamepad-wrapper';
import { gsap } from 'gsap';
import { init } from './init.js';

const bullets = {};
const forwardVector = new THREE.Vector3(0, 0, -1);
const bulletSpeed = 10;
const bulletTimeToLive = 1;

const rightHandGroup = new THREE.Group();
const leftHandGroup = new THREE.Group();
const targets = [];

let score = 0;
let gorillasHealth = 200;
const MAX_HEALTH = 200;

// Create UI container that will follow the camera
const uiContainer = new THREE.Group();

const scoreText = new Text();
scoreText.fontSize = 0.52;
scoreText.font = 'assets/SpaceMono-Bold.ttf';
scoreText.color = 0xffa276;
scoreText.anchorX = 'center';
scoreText.anchorY = 'middle';

// Create health bar container
const healthBarWidth = 0.8;
const healthBarHeight = 0.1;
const healthBarGeometry = new THREE.BoxGeometry(healthBarWidth, healthBarHeight, 0.01);
const healthBarMaterial = new THREE.MeshBasicMaterial({ color: 0x333333 });
const healthBarContainer = new THREE.Mesh(healthBarGeometry, healthBarMaterial);

// Create the actual health bar that will decrease
const healthBarFillGeometry = new THREE.BoxGeometry(healthBarWidth, healthBarHeight, 0.015);
const healthBarFillMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
const healthBarFill = new THREE.Mesh(healthBarFillGeometry, healthBarFillMaterial);

// Add UI elements to the container
uiContainer.add(scoreText);
uiContainer.add(healthBarContainer);
uiContainer.add(healthBarFill);

// Position UI elements relative to container
scoreText.position.set(0, -0.7, -1.44);
scoreText.rotateX(-Math.PI / 6);

healthBarContainer.position.set(0, -0.55, -1.44);
healthBarContainer.rotation.x = -Math.PI / 6;

healthBarFill.position.copy(healthBarContainer.position);
healthBarFill.rotation.copy(healthBarContainer.rotation);

// Create game over panel
const gameOverPanel = new THREE.Group();
gameOverPanel.visible = false;

// Game over background panel
const panelGeometry = new THREE.PlaneGeometry(2, 1.5);
const panelMaterial = new THREE.MeshBasicMaterial({ 
	color: 0x000000,
	transparent: true,
	opacity: 0.8
});
const panel = new THREE.Mesh(panelGeometry, panelMaterial);
gameOverPanel.add(panel);

// Game over text
const gameOverText = new Text();
gameOverText.text = 'GAME OVER';
gameOverText.fontSize = 0.2;
gameOverText.font = 'assets/SpaceMono-Bold.ttf';
gameOverText.color = 0xff0000;
gameOverText.position.set(0, 0.2, 0.01);
gameOverText.anchorX = 'center';
gameOverText.anchorY = 'middle';
gameOverPanel.add(gameOverText);

// Final score text
const finalScoreText = new Text();
finalScoreText.fontSize = 0.15;
finalScoreText.font = 'assets/SpaceMono-Bold.ttf';
finalScoreText.color = 0xffffff;
finalScoreText.position.set(0, 0, 0.01);
finalScoreText.anchorX = 'center';
finalScoreText.anchorY = 'middle';
gameOverPanel.add(finalScoreText);

// Play again button
const buttonGeometry = new THREE.PlaneGeometry(1, 0.3);
const buttonMaterial = new THREE.MeshBasicMaterial({ 
	color: 0x00ff00,
	transparent: true,
	opacity: 0.9
});
const playAgainButton = new THREE.Mesh(buttonGeometry, buttonMaterial);
playAgainButton.position.set(0, -0.3, 0.01);
gameOverPanel.add(playAgainButton);

const playAgainText = new Text();
playAgainText.text = 'PLAY AGAIN';
playAgainText.fontSize = 0.15;
playAgainText.font = 'assets/SpaceMono-Bold.ttf';
playAgainText.color = 0x000000;
playAgainText.position.set(0, -0.3, 0.02);
playAgainText.anchorX = 'center';
playAgainText.anchorY = 'middle';
gameOverPanel.add(playAgainText);

let laserSound, leftLaserSound, scoreSound, punchSound;
let rightHandOpenMesh = null;
let rightHandFistMesh = null;
let rightHandIsFist = false;
let leftHandOpenMesh = null;
let leftHandFistMesh = null;
let leftHandIsFist = false;

let soundtrack = null;
let characterMixer = null;
let walkingCharacter = null;
let walkAction = null;
let punchAction = null;
let punchCount = 0;
const PUNCH_DISTANCE = 2.0;
const MAX_PUNCHES = 2;

// Array to store multiple characters and their ragdolls
const characters = [];
const ragdolls = [];
const NUM_CHARACTERS = 100;
const MIN_SPAWN_DISTANCE = 10;
const MAX_SPAWN_DISTANCE = 40;

let lastCollisionCheck = 0;
const COLLISION_CHECK_INTERVAL = 33; // Increased check frequency from 100ms to 33ms

// Physics world
const world = new CANNON.World({
	gravity: new CANNON.Vec3(0, -4.91, 0),
	solver: new CANNON.GSSolver(),
	iterations: 3,
	tolerance: 0.001,
});

// Set up broadphase after world is initialized
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;
world.defaultContactMaterial.friction = 0.3;
world.defaultContactMaterial.restitution = 0.3;

// Add physics bodies for hands
const rightHandBody = new CANNON.Body({
	mass: 1,
	shape: new CANNON.Box(new CANNON.Vec3(0.1, 0.1, 0.1)),
	material: new CANNON.Material({ friction: 0.5, restitution: 0.3 }),
});

const leftHandBody = new CANNON.Body({
	mass: 1,
	shape: new CANNON.Box(new CANNON.Vec3(0.1, 0.1, 0.1)),
	material: new CANNON.Material({ friction: 0.5, restitution: 0.3 }),
});

world.addBody(rightHandBody);
world.addBody(leftHandBody);

// Add contact material for hand-character interaction
const handMaterial = new CANNON.Material();
const characterMaterial = new CANNON.Material();
const handCharacterContact = new CANNON.ContactMaterial(
	handMaterial,
	characterMaterial,
	{
		friction: 0.5,
		restitution: 0.3,
		contactEquationStiffness: 1e6,
		contactEquationRelaxation: 3,
	},
);
world.addContactMaterial(handCharacterContact);

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
groundBody.position.set(0, 0, 0);
groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
world.addBody(groundBody);

// Add collision detection between ragdoll and ground
world.addEventListener('beginContact', (event) => {
	const bodyA = event.bodyA;
	const bodyB = event.bodyB;

	// Check if either body is the ground
	if (bodyA === groundBody || bodyB === groundBody) {
		const otherBody = bodyA === groundBody ? bodyB : bodyA;

		// If the other body is part of the ragdoll, apply some damping to prevent bouncing
		if (otherBody.mass > 0) {
			otherBody.linearDamping = 0.3;
			otherBody.angularDamping = 0.3;
		}
	}
});

function updateScoreDisplay() {
	scoreText.text = score.toString();
	scoreText.sync();
}

function updateHealthBar() {
	const healthPercent = gorillasHealth / MAX_HEALTH;
	healthBarFill.scale.x = Math.max(0, healthPercent);
	healthBarFill.position.x = (healthBarWidth * (healthPercent - 1)) / 2;
	
	// Update color based on health
	const hue = healthPercent * 0.3; // Goes from red (0) to green (0.3)
	healthBarFillMaterial.color.setHSL(hue, 1, 0.5);
}

function showGameOver(scene, camera) {
	finalScoreText.text = `Final Score: ${score}`;
	finalScoreText.sync();
	gameOverText.sync();
	playAgainText.sync();
	
	// Position panel in front of camera
	const distance = 2;
	gameOverPanel.position.copy(camera.position);
	gameOverPanel.rotation.copy(camera.rotation);
	gameOverPanel.translateZ(-distance);
	
	gameOverPanel.visible = true;
	
	// Add click detection for play again button
	const raycaster = new THREE.Raycaster();
	const mouse = new THREE.Vector2();
	
	function onClick(event) {
		// Convert mouse position to normalized device coordinates
		mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
		mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
		
		raycaster.setFromCamera(mouse, camera);
		const intersects = raycaster.intersectObject(playAgainButton);
		
		if (intersects.length > 0) {
			resetGame(scene);
			window.removeEventListener('click', onClick);
		}
	}
	
	window.addEventListener('click', onClick);
}

function resetGame(scene) {
	gorillasHealth = MAX_HEALTH;
	score = 0;
	updateHealthBar();
	updateScoreDisplay();
	gameOverPanel.visible = false;
	
	// Remove all existing ragdolls
	ragdolls.forEach(ragdoll => {
		ragdoll.constraints.forEach(constraint => world.removeConstraint(constraint));
		ragdoll.bodies.forEach(body => world.removeBody(body));
		scene.remove(ragdoll.group);
	});
	ragdolls.length = 0;
	
	// Reset all characters
	characters.forEach(character => {
		if (!character.isActive) {
			character.isActive = true;
			character.model.position.copy(getRandomSpawnPosition());
			scene.add(character.model);
			if (character.walkAction) {
				character.walkAction.reset();
				character.walkAction.play();
			}
		}
	});
}

// Function to generate a random spawn position
function getRandomSpawnPosition() {
	let position;
	let attempts = 0;
	const maxAttempts = 100;

	do {
		// Generate random angle and distance
		const angle = Math.random() * Math.PI * 2;
		const distance = MIN_SPAWN_DISTANCE + Math.random() * (MAX_SPAWN_DISTANCE - MIN_SPAWN_DISTANCE);

		// Calculate position
		position = new THREE.Vector3(
			Math.cos(angle) * distance,
			0,
			Math.sin(angle) * distance
		);

		attempts++;

		if (attempts >= maxAttempts) break;
	} while (position.length() < MIN_SPAWN_DISTANCE);

	return position;
}

function setupScene({ scene, camera, renderer, player, controllers }) {
	scene.background = new THREE.Color(0x87ceeb);
	const gltfLoader = new GLTFLoader();
	const fbxLoader = new FBXLoader();

	// Add lighting
	const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
	scene.add(ambientLight);

	const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
	directionalLight.position.set(5, 5, 5);
	directionalLight.castShadow = true;
	scene.add(directionalLight);

	// Load the walking character for each instance
	for (let i = 0; i < NUM_CHARACTERS; i++) {
		fbxLoader.load('assets/Walking.fbx', (walkingFbx) => {
			walkingFbx.scale.setScalar(0.005);

			// Get random spawn position
			const spawnPosition = getRandomSpawnPosition();
			walkingFbx.position.copy(spawnPosition);

			scene.add(walkingFbx);

			const character = {
				model: walkingFbx,
				mixer: new THREE.AnimationMixer(walkingFbx),
				walkAction: null,
				punchAction: null,
				punchCount: 0,
				isActive: true,
				isPunching: false
			};
			characters.push(character);

			// Set up animation mixer
			character.mixer = new THREE.AnimationMixer(walkingFbx);

			// Load punching animation
			fbxLoader.load('assets/Punching.fbx', (punchingFbx) => {
				if (
					walkingFbx.animations.length > 0 &&
					punchingFbx.animations.length > 0
				) {
					// Set up walking animation
					character.walkAction = character.mixer.clipAction(
						walkingFbx.animations[0],
					);
					character.walkAction.loop = THREE.LoopRepeat;
					character.walkAction.play();

					// Set up punching animation
					character.punchAction = character.mixer.clipAction(
						punchingFbx.animations[0],
					);
					character.punchAction.loop = THREE.LoopOnce;
					character.punchAction.enabled = false;
					character.punchAction.clampWhenFinished = true;

					// Add mixer event listener for when punch animation completes
					character.mixer.addEventListener('finished', (e) => {
						if (e.action === character.punchAction) {
							// Just increment punch count but don't create ragdoll
							character.punchCount++;
							character.isPunching = false;
							
							// Switch back to walking after punch completes
							character.walkAction.enabled = true;
							character.walkAction.play();
						}
					});
				}
			});
		});
	}

	gltfLoader.load('assets/football_court.glb', (gltf) => {
		gltf.scene.position.y = 0;
		gltf.scene.scale.set(6, 6, 6);
		scene.add(gltf.scene);
	});

	gltfLoader.load('assets/gorilla_hand.glb', (gltf) => {
		gltf.scene.scale.set(0.33, 0.33, 0.33);
		gltf.scene.scale.x *= -1;
		gltf.scene.rotation.y = -Math.PI / 2;
		gltf.scene.rotation.x = -Math.PI / 2;
		rightHandOpenMesh = gltf.scene;
		rightHandGroup.add(rightHandOpenMesh);
	});

	gltfLoader.load('assets/fist.glb', (gltf) => {
		gltf.scene.scale.set(0.33, 0.33, 0.33);
		gltf.scene.scale.x *= -1;
		gltf.scene.rotation.y = -Math.PI / 2;
		gltf.scene.rotation.x = -Math.PI / 2;
		rightHandFistMesh = gltf.scene;
	});

	gltfLoader.load('assets/gorilla_hand.glb', (gltf) => {
		gltf.scene.scale.set(0.33, 0.33, 0.33);
		gltf.scene.rotation.y = Math.PI / 2;
		gltf.scene.rotation.x = -Math.PI / 2;
		leftHandOpenMesh = gltf.scene;
		leftHandGroup.add(leftHandOpenMesh);
	});

	gltfLoader.load('assets/fist.glb', (gltf) => {
		gltf.scene.scale.set(0.33, 0.33, 0.33);
		gltf.scene.rotation.y = Math.PI / 2;
		gltf.scene.rotation.x = -Math.PI / 2;
		leftHandFistMesh = gltf.scene;
	});

	gltfLoader.load('assets/target.glb', (gltf) => {
		for (let i = 0; i < 3; i++) {
			const target = gltf.scene.clone();
			target.position.set(
				Math.random() * 10 - 5,
				i * 2 + 1,
				-Math.random() * 5 - 5,
			);
			scene.add(target);
			targets.push(target);
		}
	});

	scene.add(uiContainer);
	scene.add(gameOverPanel);
	
	updateScoreDisplay();
	updateHealthBar();

	// Load and set up positional audio
	const listener = new THREE.AudioListener();
	camera.add(listener);

	const audioLoader = new THREE.AudioLoader();

	// Right controller laser sound
	laserSound = new THREE.PositionalAudio(listener);
	audioLoader.load('assets/laser.ogg', (buffer) => {
		laserSound.setBuffer(buffer);
		rightHandGroup.add(laserSound);
	});

	// Left controller laser sound
	leftLaserSound = new THREE.PositionalAudio(listener);
	audioLoader.load('assets/laser.ogg', (buffer) => {
		leftLaserSound.setBuffer(buffer);
		leftHandGroup.add(leftLaserSound);
	});

	scoreSound = new THREE.PositionalAudio(listener);
	audioLoader.load('assets/score.ogg', (buffer) => {
		scoreSound.setBuffer(buffer);
		scoreText.add(scoreSound);
	});

	// Add punch sound - using score.ogg as a fallback but ideally we'd use a punch sound
	punchSound = new THREE.PositionalAudio(listener);
	audioLoader.load('assets/score.ogg', (buffer) => {
		punchSound.setBuffer(buffer);
		punchSound.setVolume(3.0); // Even louder for more impact
		punchSound.setPlaybackRate(0.5); // Lower pitch for more "thud" effect
		scene.add(punchSound);
	});

	audioLoader.load('assets/soundtrack.mp3', (buffer) => {
		soundtrack = new THREE.Audio(listener);
		soundtrack.setBuffer(buffer);
		soundtrack.loop = true;
		soundtrack.play();
	});
}

// Create an impact effect at the given position
function createImpactEffect(scene, position) {
	// Visual shockwave ring
	const ringGeometry = new THREE.RingGeometry(0.1, 0.2, 32);
	const ringMaterial = new THREE.MeshBasicMaterial({ 
		color: 0xff5500,
		side: THREE.DoubleSide,
		transparent: true,
		opacity: 0.8
	});
	
	const ring = new THREE.Mesh(ringGeometry, ringMaterial);
	ring.position.copy(position);
	// Orient ring to face camera
	ring.lookAt(0, position.y, 0);
	scene.add(ring);
	
	// Animate ring expanding
	gsap.to(ring.scale, {
		x: 10,
		y: 10,
		z: 10,
		duration: 0.5,
		ease: "power2.out",
		onComplete: () => {
			scene.remove(ring);
			ringGeometry.dispose();
			ringMaterial.dispose();
		}
	});
	
	gsap.to(ringMaterial, {
		opacity: 0,
		duration: 0.5
	});
	
	// Create a particle system for the impact
	const particleCount = 75; // Increased particle count
	const particleGeometry = new THREE.BufferGeometry();
	const particlePositions = new Float32Array(particleCount * 3);
	
	for (let i = 0; i < particleCount; i++) {
		particlePositions[i * 3] = 0;
		particlePositions[i * 3 + 1] = 0;
		particlePositions[i * 3 + 2] = 0;
	}
	
	particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
	
	const particleMaterial = new THREE.PointsMaterial({
		color: 0xff5500, // Changed to orange-red for a more powerful look
		size: 0.15, // Slightly larger particles
		blending: THREE.AdditiveBlending,
		transparent: true,
		sizeAttenuation: true
	});
	
	const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
	particleSystem.position.copy(position);
	scene.add(particleSystem);
	
	// Animate particles
	const velocities = [];
	for (let i = 0; i < particleCount; i++) {
		velocities.push({
			x: (Math.random() - 0.5) * 3, // Increased velocity range
			y: (Math.random() - 0.5) * 3,
			z: (Math.random() - 0.5) * 3
		});
	}
	
	// Use gsap to animate particles expanding outward
	gsap.to(particleMaterial, {
		duration: 0.8,
		opacity: 0,
		size: 0.05,
		onUpdate: () => {
			const positions = particleGeometry.attributes.position.array;
			
			for (let i = 0; i < particleCount; i++) {
				positions[i * 3] += velocities[i].x * 0.15; // Faster movement
				positions[i * 3 + 1] += velocities[i].y * 0.15;
				positions[i * 3 + 2] += velocities[i].z * 0.15;
			}
			
			particleGeometry.attributes.position.needsUpdate = true;
		},
		onComplete: () => {
			scene.remove(particleSystem);
			particleGeometry.dispose();
			particleMaterial.dispose();
		}
	});
}

function handleCharacterPunch(character, scene, ragdolls, handPosition, controllers) {
	const charPosition = new CANNON.Vec3(
		character.model.position.x,
		character.model.position.y,
		character.model.position.z
	);
	
	const flyBackDistance = 3; // Slightly increased for better effect
	const flyUpHeight = 2; // Adjusted for better visibility
	
	const punchDirection = new THREE.Vector3()
		.subVectors(
			new THREE.Vector3(charPosition.x, charPosition.y, charPosition.z),
			handPosition
		)
		.normalize();
	
	// Move the character model immediately in the punch direction
	character.model.position.add(
		punchDirection.multiplyScalar(flyBackDistance)
	);
	character.model.position.y += flyUpHeight;
	
	if (punchSound && !punchSound.isPlaying) {
		punchSound.position.copy(charPosition);
		punchSound.setVolume(5.0);
		punchSound.play();
		
		if (controllers) {
			const controllerToUse = handPosition.equals(rightHandGroup.position) ? 
				controllers.right : controllers.left;
				
			if (controllerToUse && controllerToUse.gamepad) {
				try {
					controllerToUse.gamepad.getHapticActuator(0).pulse(1.0, 100);
				} catch {
					// do nothing
				}
			}
		}
	}
	
	// Mark character as inactive immediately to prevent double-hits
	character.isActive = false;
	
	// Create ragdoll after a shorter delay
	setTimeout(() => {
		// Create ragdoll at the character's current position
		const newRagdollPosition = new CANNON.Vec3(
			character.model.position.x,
			character.model.position.y,
			character.model.position.z
		);
		
		// Create smaller ragdoll to match character scale
		const newRagdoll = createRagdoll(0.006, newRagdollPosition);
		scene.add(newRagdoll.group);
		ragdolls.push(newRagdoll);
		
		// Configure ragdoll physics
		newRagdoll.bodies.forEach((body) => {
			body.mass = 1; // Reduced mass for better physics
			body.linearDamping = 0.1; // Reduced damping for more movement
			body.angularDamping = 0.1;
			body.material = new CANNON.Material({
				friction: 0.4,
				restitution: 0.3,
			});
			world.addBody(body);
			
			// Apply stronger initial forces
			const force = new CANNON.Vec3(
				punchDirection.x * 1000, // Adjusted force for new mass
				2000, // Stronger upward force
				punchDirection.z * 1000
			);
			body.applyForce(force, body.position);
			
			// Add some spin
			body.angularVelocity.set(
				(Math.random() - 0.5) * 15,
				(Math.random() - 0.5) * 15,
				(Math.random() - 0.5) * 15
			);
		});
		
		// Add constraints with proper parameters
		newRagdoll.constraints.forEach((constraint) => {
			if (constraint instanceof CANNON.ConeTwistConstraint) {
				constraint.twistAngle = Math.PI / 8; // Allow more twist
				constraint.angle = Math.PI / 8; // Allow more cone angle
			}
			world.addConstraint(constraint);
		});
		
		// Remove the character model and increment score
		scene.remove(character.model);
		score += 1;
		updateScoreDisplay();
	}, 50); // Reduced delay for more immediate feedback
}

function checkHandCollisions(time, rightHandGroup, leftHandGroup, characters, scene, ragdolls, controllers) {
	// Check collisions every frame instead of using interval
	// Create bounding boxes for hands with much larger padding for easier collision detection
	const rightHandBox = new THREE.Box3().setFromObject(rightHandGroup).expandByScalar(1);
	const leftHandBox = new THREE.Box3().setFromObject(leftHandGroup).expandByScalar(1);
	
	// Check right hand first (only if making a fist)
	if (rightHandIsFist) {
		characters.forEach((character, index) => {
			if (!character.isActive) return;
			
			// Create character bounding box with larger padding
			const characterBox = new THREE.Box3().setFromObject(character.model).expandByScalar(1);
			
			// Simple distance check first
			const handPos = new THREE.Vector3();
			rightHandGroup.getWorldPosition(handPos);
			const charPos = new THREE.Vector3();
			character.model.getWorldPosition(charPos);
			
			// If within reasonable punch distance
			if (handPos.distanceTo(charPos) < 3) {
				if (rightHandBox.intersectsBox(characterBox)) {
					handleCharacterPunch(character, scene, ragdolls, rightHandGroup.position, controllers);
					if (scoreSound && !scoreSound.isPlaying) {
						scoreSound.play();
					}
				}
			}
		});
	}
	
	// Check left hand (only if making a fist)
	if (leftHandIsFist) {
		characters.forEach((character, index) => {
			if (!character.isActive) return;
			
			// Create character bounding box with larger padding
			const characterBox = new THREE.Box3().setFromObject(character.model).expandByScalar(1);
			
			// Simple distance check first
			const handPos = new THREE.Vector3();
			leftHandGroup.getWorldPosition(handPos);
			const charPos = new THREE.Vector3();
			character.model.getWorldPosition(charPos);
			
			// If within reasonable punch distance
			if (handPos.distanceTo(charPos) < 3) {
				if (leftHandBox.intersectsBox(characterBox)) {
					handleCharacterPunch(character, scene, ragdolls, leftHandGroup.position, controllers);
					if (scoreSound && !scoreSound.isPlaying) {
						scoreSound.play();
					}
				}
			}
		});
	}
}

function onFrame(
	delta,
	time,
	{ scene, camera, renderer, player, controllers },
) {
	// Update physics world with fixed time step
	world.step(1 / 90); // Increased physics update rate for smoother VR

	// Update character animations
	characters.forEach((character) => {
		if (character.mixer) {
			character.mixer.update(delta);
		}
	});

	// Update ragdoll meshes to match physics bodies
	ragdolls.forEach((ragdoll) => {
		if (!ragdoll.group.parent) return; // Skip if ragdoll was removed

		// Update each mesh to match its corresponding physics body
		ragdoll.group.children.forEach((mesh, index) => {
			if (mesh instanceof THREE.Mesh && ragdoll.bodies[index]) {
				mesh.position.copy(ragdoll.bodies[index].position);
				mesh.quaternion.copy(ragdoll.bodies[index].quaternion);
			}
		});

		// Apply continuous forces to make ragdolls more dynamic
		if (Math.random() < 0.1) {
			// 10% chance each frame
			ragdoll.bodies.forEach((body) => {
				const force = new CANNON.Vec3(
					(Math.random() - 0.5) * 100, // Smaller continuous forces
					Math.random() * 50,
					(Math.random() - 0.5) * 100,
				);
				body.applyForce(force, body.position);

				// Add some random angular velocity
				body.angularVelocity.set(
					(Math.random() - 0.5) * 2,
					(Math.random() - 0.5) * 2,
					(Math.random() - 0.5) * 2,
				);
			});
		}
	});

	// Move characters towards player
	const playerPosition = new THREE.Vector3();
	player.getWorldPosition(playerPosition);

	characters.forEach((character) => {
		if (!character.isActive) return;

		const direction = new THREE.Vector3();
		direction.subVectors(playerPosition, character.model.position).normalize();

		const distance = character.model.position.distanceTo(playerPosition);

		// Move character towards player if not too close
		if (distance > PUNCH_DISTANCE) {
			const moveSpeed = 0.12; // Reduced from 0.25 but still faster than original 0.08
			character.model.position.add(direction.multiplyScalar(moveSpeed));
			character.model.lookAt(playerPosition);
		}

		// Switch animations based on distance
		if (distance <= PUNCH_DISTANCE) {
			if (character.walkAction && character.walkAction.isRunning()) {
				character.walkAction.stop();
				if (character.punchAction && !character.isPunching) {
					character.isPunching = true;
					character.punchAction.enabled = true;
					character.punchAction.reset();
					character.punchAction.play();
					
					// Increased damage from punches
					gorillasHealth -= 2; // Doubled damage
					updateHealthBar();
					
					if (gorillasHealth <= 0) {
						showGameOver(scene, camera);
					}
				}
			}
		} else {
			if (character.punchAction && character.isPunching) {
				character.isPunching = false;
				character.punchAction.stop();
				if (character.walkAction) {
					character.walkAction.enabled = true;
					character.walkAction.play();
				}
			}
		}
	});

	// Use the new collision detection function
	checkHandCollisions(time, rightHandGroup, leftHandGroup, characters, scene, ragdolls, controllers);

	// Update hand physics bodies
	if (rightHandGroup) {
		rightHandBody.position.copy(rightHandGroup.position);
		rightHandBody.quaternion.copy(rightHandGroup.quaternion);
	}
	if (leftHandGroup) {
		leftHandBody.position.copy(leftHandGroup.position);
		leftHandBody.quaternion.copy(leftHandGroup.quaternion);
	}

	// Handle right controller
	if (controllers.right) {
		const { gamepad, raySpace, mesh } = controllers.right;
		if (!raySpace.children.includes(rightHandGroup)) {
			raySpace.add(rightHandGroup);
			mesh.visible = false;
		}

		// Swap to fist on trigger press, open on release
		if (gamepad.getButtonValue(XR_BUTTONS.TRIGGER) > 0.5) {
			if (!rightHandIsFist && rightHandFistMesh && rightHandOpenMesh) {
				console.log("Right hand making fist");
				rightHandGroup.remove(rightHandOpenMesh);
				rightHandGroup.add(rightHandFistMesh);
				rightHandIsFist = true;
				
				// Add visual cue that hand is in "punch mode"
				if (rightHandFistMesh) {
					rightHandFistMesh.traverse((child) => {
						if (child.isMesh) {
							// Store original color if not already stored
							if (!child.userData.originalColor) {
								child.userData.originalColor = child.material.color.clone();
							}
							// Set fist color to indicate "punch mode"
							child.material.color.set(0xff3300);
							child.material.emissive = new THREE.Color(0x661100);
						}
					});
				}
			}
		} else {
			if (rightHandIsFist && rightHandFistMesh && rightHandOpenMesh) {
				console.log("Right hand opening");
				rightHandGroup.remove(rightHandFistMesh);
				rightHandGroup.add(rightHandOpenMesh);
				rightHandIsFist = false;
				
				// Restore original colors
				if (rightHandFistMesh) {
					rightHandFistMesh.traverse((child) => {
						if (child.isMesh && child.userData.originalColor) {
							child.material.color.copy(child.userData.originalColor);
							child.material.emissive = new THREE.Color(0x000000);
						}
					});
				}
			}
		}
	}

	// Handle left controller
	if (controllers.left) {
		const { gamepad, raySpace, mesh } = controllers.left;
		if (!raySpace.children.includes(leftHandGroup)) {
			raySpace.add(leftHandGroup);
			mesh.visible = false;
		}

		// Swap to fist on trigger press, open on release
		if (gamepad.getButtonValue(XR_BUTTONS.TRIGGER) > 0.5) {
			if (!leftHandIsFist && leftHandFistMesh && leftHandOpenMesh) {
				leftHandGroup.remove(leftHandOpenMesh);
				leftHandGroup.add(leftHandFistMesh);
				leftHandIsFist = true;
				
				// Add visual cue that hand is in "punch mode"
				if (leftHandFistMesh) {
					leftHandFistMesh.traverse((child) => {
						if (child.isMesh) {
							// Store original color if not already stored
							if (!child.userData.originalColor) {
								child.userData.originalColor = child.material.color.clone();
							}
							// Set fist color to indicate "punch mode"
							child.material.color.set(0xff3300);
							child.material.emissive = new THREE.Color(0x661100);
						}
					});
				}
			}
		} else {
			if (leftHandIsFist && leftHandFistMesh && leftHandOpenMesh) {
				leftHandGroup.remove(leftHandFistMesh);
				leftHandGroup.add(leftHandOpenMesh);
				leftHandIsFist = false;
				
				// Restore original colors
				if (leftHandFistMesh) {
					leftHandFistMesh.traverse((child) => {
						if (child.isMesh && child.userData.originalColor) {
							child.material.color.copy(child.userData.originalColor);
							child.material.emissive = new THREE.Color(0x000000);
						}
					});
				}
			}
		}

		if (gamepad.getButtonClick(XR_BUTTONS.TRIGGER)) {
			try {
				gamepad.getHapticActuator(0).pulse(0.6, 100);
			} catch {
				// do nothing
			}
		}
	}

	// Update UI container position to follow camera
	uiContainer.position.copy(camera.position);
	uiContainer.quaternion.copy(camera.quaternion);
}

// Also modify the world gravity to make ragdolls fall more naturally
world.gravity.set(0, -9.82, 0); // Standard Earth gravity

init(setupScene, onFrame);
