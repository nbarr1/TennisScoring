package com.companytennisleague.app.data

import com.companytennisleague.app.domain.User
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await

interface AuthRepository { val userId: String?; suspend fun signIn(email: String, password: String); fun signOut() }
class FirebaseAuthRepository(private val auth: FirebaseAuth = FirebaseAuth.getInstance()): AuthRepository {
  override val userId get() = auth.currentUser?.uid
  override suspend fun signIn(email: String, password: String) { auth.signInWithEmailAndPassword(email,password).await() }
  override fun signOut() = auth.signOut()
}
interface UserRepository { fun observe(id: String): Flow<User?>; suspend fun registerToken(id: String, token: String) }
class FirestoreUserRepository(private val db: FirebaseFirestore = FirebaseFirestore.getInstance()): UserRepository {
  override fun observe(id: String): Flow<User?> = callbackFlow { val registration=db.collection("users").document(id).addSnapshotListener { value,error -> if(error!=null) close(error) else trySend(value?.takeIf{it.exists()}?.let(FirestoreMapper::user)) }; awaitClose { registration.remove() } }
  override suspend fun registerToken(id: String, token: String) { db.collection("users").document(id).update("fcmTokens", com.google.firebase.firestore.FieldValue.arrayUnion(token)).await() }
}
class CallableRepository(private val functions: FirebaseFunctions = FirebaseFunctions.getInstance()) {
  suspend fun call(request: CallableRequest): CallableResult<Map<String,Any?>> = try { @Suppress("UNCHECKED_CAST") CallableResult.Success(functions.getHttpsCallable(request.name).call(request.payload).await().data as? Map<String,Any?> ?: emptyMap()) } catch (e: Exception) { CallableResult.Failure("callable_failed", e.message ?: "Unknown callable failure") }
}
