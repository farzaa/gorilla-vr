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
const scoreText = new Text();
scoreText.fontSize = 0.52;
scoreText.font = 'assets/SpaceMono-Bold.ttf';
scoreText.position.z = -2;
scoreText.color = 0xffa276;
scoreText.anchorX = 'center';
scoreText.anchorY = 'middle';

let laserSound, leftLaserSound, scoreSound;
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

// Physics world
const world = new CANNON.World({
	gravity: new CANNON.Vec3(0, -9.82, 0),
});

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
	const clampedScore = Math.max(0, Math.min(9999, score));
	const displayScore = clampedScore.toString().padStart(4, '0');
	scoreText.text = displayScore;
	scoreText.sync();
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

	// Load the walking character
	fbxLoader.load('assets/Walking.fbx', (walkingFbx) => {
		walkingFbx.scale.setScalar(0.015);
		walkingFbx.position.set(0, 0, -15);
		scene.add(walkingFbx);
		walkingCharacter = walkingFbx;

		// Set up animation mixer
		characterMixer = new THREE.AnimationMixer(walkingFbx);

		// Load punching animation
		fbxLoader.load('assets/Punching.fbx', (punchingFbx) => {
			if (
				walkingFbx.animations.length > 0 &&
				punchingFbx.animations.length > 0
			) {
				// Set up walking animation
				walkAction = characterMixer.clipAction(walkingFbx.animations[0]);
				walkAction.loop = THREE.LoopRepeat;
				walkAction.play();

				// Set up punching animation
				punchAction = characterMixer.clipAction(punchingFbx.animations[0]);
				punchAction.loop = THREE.LoopOnce;
				punchAction.enabled = false;
				punchAction.clampWhenFinished = true;

				// Add mixer event listener for when punch animation completes
				characterMixer.addEventListener('finished', (e) => {
					if (e.action === punchAction) {
						console.log('Punch animation finished event triggered');
						punchCount++;
						console.log('Punch completed, count:', punchCount);

						if (punchCount >= MAX_PUNCHES) {
							console.log('Creating ragdoll...');
							// Get the character's current position
							const charPosition = new CANNON.Vec3(
								walkingCharacter.position.x,
								walkingCharacter.position.y,
								walkingCharacter.position.z,
							);

							// Create a new ragdoll at the character's position with 50% larger scale
							const newRagdoll = createRagdoll(1.75, charPosition);
							scene.add(newRagdoll.group);

							// Configure ragdoll physics
							newRagdoll.bodies.forEach((body) => {
								// Set proper mass and damping
								body.mass = 5; // Increase mass for better physics response
								body.linearDamping = 0.1; // Reduce linear damping
								body.angularDamping = 0.1; // Reduce angular damping

								// Set material properties
								body.material = new CANNON.Material({
									friction: 0.3,
									restitution: 0.3,
								});

								// Add to world
								world.addBody(body);
							});

							// Add constraints to world
							newRagdoll.constraints.forEach((constraint) => {
								world.addConstraint(constraint);
							});

							// Remove the character model from the scene
							scene.add(newRagdoll.group);
							scene.remove(walkingCharacter);
							walkingCharacter = null;

							// Apply stronger random forces to make it look more dynamic
							newRagdoll.bodies.forEach((body) => {
								const force = new CANNON.Vec3(
									(Math.random() - 0.5) * 500, // Increased force
									Math.random() * 500, // Increased force
									(Math.random() - 0.5) * 500, // Increased force
								);
								body.applyForce(force, body.position);

								// Add some angular velocity for more dynamic movement
								body.angularVelocity.set(
									(Math.random() - 0.5) * 5,
									(Math.random() - 0.5) * 5,
									(Math.random() - 0.5) * 5,
								);
							});
						} else {
							// Switch back to walking after punch completes
							walkAction.enabled = true;
							walkAction.play();
						}
					}
				});
			}
		});
	});

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

	scene.add(scoreText);
	scoreText.position.set(0, 0.67, -1.44);
	scoreText.rotateX(-Math.PI / 3.3);
	updateScoreDisplay();

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

	audioLoader.load('assets/soundtrack.mp3', (buffer) => {
		soundtrack = new THREE.Audio(listener);
		soundtrack.setBuffer(buffer);
		soundtrack.loop = true;
		soundtrack.play();
	});
}

function onFrame(
	delta,
	time,
	{ scene, camera, renderer, player, controllers },
) {
	// Update physics world
	world.step(1 / 60);

	// Update character animation
	if (characterMixer) {
		characterMixer.update(delta);
	}

	// Update ragdoll meshes to match physics bodies
	if (walkingCharacter === null) {
		// Find the ragdoll group in the scene
		const ragdollGroup = scene.children.find(
			(child) =>
				child instanceof THREE.Group &&
				child.children.length > 0 &&
				child.children.some(
					(mesh) =>
						mesh instanceof THREE.Mesh &&
						mesh.material &&
						mesh.material.color &&
						mesh.material.color.getHex() === 0xff0000,
				),
		);

		if (ragdollGroup) {
			// Get the ragdoll bodies from the world
			const ragdollBodies = world.bodies.filter(
				(body) =>
					body.mass > 0 &&
					body.shapes.some(
						(shape) =>
							shape instanceof CANNON.Box || shape instanceof CANNON.Sphere,
					),
			);

			// Update each mesh to match its corresponding physics body
			ragdollGroup.children.forEach((mesh, index) => {
				if (mesh instanceof THREE.Mesh && ragdollBodies[index]) {
					mesh.position.copy(ragdollBodies[index].position);
					mesh.quaternion.copy(ragdollBodies[index].quaternion);
				}
			});
		}
	}

	// Move character towards player
	if (walkingCharacter) {
		const playerPosition = new THREE.Vector3();
		player.getWorldPosition(playerPosition);

		// Calculate direction to player
		const direction = new THREE.Vector3();
		direction.subVectors(playerPosition, walkingCharacter.position).normalize();

		// Calculate distance to player
		const distance = walkingCharacter.position.distanceTo(playerPosition);

		// Move character towards player if not too close
		if (distance > PUNCH_DISTANCE) {
			const moveSpeed = 0.03;
			walkingCharacter.position.add(direction.multiplyScalar(moveSpeed));
			walkingCharacter.lookAt(playerPosition);
		}

		// Switch animations based on distance
		if (distance <= PUNCH_DISTANCE) {
			if (walkAction && walkAction.isRunning()) {
				console.log('Switching to punch animation');
				walkAction.stop();
				if (punchAction) {
					punchAction.enabled = true;
					punchAction.reset();
					punchAction.play();
				}
			}
		} else {
			if (punchAction && punchAction.isRunning()) {
				console.log('Switching to walk animation');
				punchAction.stop();
				if (walkAction) {
					walkAction.enabled = true;
					walkAction.play();
				}
			}
		}

		// Check for collision between hands and player
		if (rightHandGroup && leftHandGroup) {
			const rightHandBox = new THREE.Box3().setFromObject(rightHandGroup);
			const leftHandBox = new THREE.Box3().setFromObject(leftHandGroup);
			const playerBox = new THREE.Box3().setFromObject(player);

			if (
				rightHandBox.intersectsBox(playerBox) ||
				leftHandBox.intersectsBox(playerBox)
			) {
				// Get the player's current position
				const playerPos = new CANNON.Vec3(
					player.position.x,
					player.position.y,
					player.position.z,
				);

				// Create a new ragdoll at the player's position
				const newRagdoll = createRagdoll(1, playerPos);
				scene.add(newRagdoll.group);

				// Apply some random forces to make it look more dynamic
				newRagdoll.bodies.forEach((body) => {
					const force = new CANNON.Vec3(
						(Math.random() - 0.5) * 100,
						Math.random() * 100,
						(Math.random() - 0.5) * 100,
					);
					body.applyForce(force, body.position);
				});
			}
		}
	}

	// Update hand physics bodies
	if (rightHandGroup) {
		rightHandBody.position.copy(rightHandGroup.position);
		rightHandBody.quaternion.copy(rightHandGroup.quaternion);
	}
	if (leftHandGroup) {
		leftHandBody.position.copy(leftHandGroup.position);
		leftHandBody.quaternion.copy(leftHandGroup.quaternion);
	}

	// Check for collision between hands and character
	if (walkingCharacter) {
		const characterBox = new THREE.Box3().setFromObject(walkingCharacter);
		const rightHandBox = new THREE.Box3().setFromObject(rightHandGroup);
		const leftHandBox = new THREE.Box3().setFromObject(leftHandGroup);

		if (
			rightHandBox.intersectsBox(characterBox) ||
			leftHandBox.intersectsBox(characterBox)
		) {
			// Get the character's current position
			const charPosition = new CANNON.Vec3(
				walkingCharacter.position.x,
				walkingCharacter.position.y,
				walkingCharacter.position.z,
			);

			// Create a new ragdoll at the character's position
			const newRagdoll = createRagdoll(1.75, charPosition);
			scene.add(newRagdoll.group);

			// Configure ragdoll physics
			newRagdoll.bodies.forEach((body) => {
				body.mass = 5;
				body.linearDamping = 0.1;
				body.angularDamping = 0.1;
				body.material = new CANNON.Material({
					friction: 0.3,
					restitution: 0.3,
				});
				world.addBody(body);
			});

			// Add constraints to world
			newRagdoll.constraints.forEach((constraint) => {
				world.addConstraint(constraint);
			});

			// Remove the character model from the scene
			scene.remove(walkingCharacter);
			walkingCharacter = null;

			// Apply forces to make it look more dynamic
			newRagdoll.bodies.forEach((body) => {
				const force = new CANNON.Vec3(
					(Math.random() - 0.5) * 500,
					Math.random() * 500,
					(Math.random() - 0.5) * 500,
				);
				body.applyForce(force, body.position);

				body.angularVelocity.set(
					(Math.random() - 0.5) * 5,
					(Math.random() - 0.5) * 5,
					(Math.random() - 0.5) * 5,
				);
			});
		}
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
				rightHandGroup.remove(rightHandOpenMesh);
				rightHandGroup.add(rightHandFistMesh);
				rightHandIsFist = true;
			}
		} else {
			if (rightHandIsFist && rightHandFistMesh && rightHandOpenMesh) {
				rightHandGroup.remove(rightHandFistMesh);
				rightHandGroup.add(rightHandOpenMesh);
				rightHandIsFist = false;
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
			}
		} else {
			if (leftHandIsFist && leftHandFistMesh && leftHandOpenMesh) {
				leftHandGroup.remove(leftHandFistMesh);
				leftHandGroup.add(leftHandOpenMesh);
				leftHandIsFist = false;
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
}

init(setupScene, onFrame);
