import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
// Canvas ortamı için signInWithCustomToken tekrar eklendi
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, getDoc, addDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, where, getDocs, writeBatch } from 'firebase/firestore';
import { Home, Utensils, DollarSign, Settings, LogIn, Plus, Trash2, Check, Printer, Archive, Coffee, Table, User, Lock, ShoppingCart, Info, XCircle, CheckCircle, Bell } from 'lucide-react';
import * as Tone from 'tone'; // Tone.js'i npm paketi olarak import et

// Firebase yapılandırması ve uygulama kimliği: Ortama göre dinamik olarak belirlenir
let currentFirebaseConfig;
let currentCustomAppId;
let currentInitialAuthToken = null; // Sadece Canvas için geçerli

// Canvas ortamında mı çalışıyoruz kontrolü
if (typeof window.__firebase_config !== 'undefined' && typeof window.__app_id !== 'undefined') {
    // Canvas ortamı
    currentFirebaseConfig = JSON.parse(window.__firebase_config);
    currentCustomAppId = window.__app_id;
    currentInitialAuthToken = window.__initial_auth_token;
} else {
    // Yerel veya Vercel ortamı (Create React App)
    currentFirebaseConfig = {
        apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
        authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
        projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
        storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
        messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
        appId: process.env.REACT_APP_FIREBASE_APP_ID,
        measurementId: process.env.REACT_APP_FIREBASE_MEASUREMENT_ID
    };
    currentCustomAppId = process.env.REACT_APP_FIREBASE_PROJECT_ID || 'default-app-id';
    // initialAuthToken bu ortamda kullanılmaz, null kalır
}

const firebaseConfig = currentFirebaseConfig;
const customAppId = currentCustomAppId;
const initialAuthToken = currentInitialAuthToken; // Sadece Canvas için geçerli

// Firebase uygulaması ve servisleri
let app, db, auth;

// Rastgele içecek isimleri listesi (şifre üretimi için)
const randomDrinkNames = [
    "latte", "mocha", "espresso", "americano", "cappuccino",
    "turkkahvesi", "sutlu", "filtrekahve", "cay", "nane", "limonata",
    "portakalsuyu", "elmasuyu", "visne", "soda", "kola", "fanta",
    "ayran", "salep", "sicakcikolata", "meyvesuyu", "icecek", "kahve",
    "su", "madensuyu", "limon", "cilek", "muz", "sogukcay"
];

// Admin kullanıcı adı ve şifresi (hardcoded - sadece ilk kurulum için kullanılır)
const DEFAULT_ADMIN_USERNAME = 'admin';
const DEFAULT_ADMIN_PASSWORD = 'siparist2025';

function App() {
    const [activePanel, setActivePanel] = useState('customer'); // customer, cashier, admin
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [userId, setUserId] = useState(null);
    const [firebaseInitialized, setFirebaseInitialized] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [modalContent, setModalContent] = useState({ title: '', message: '', type: 'info' });

    // Modalı göstermek için yardımcı fonksiyon
    const showMessage = useCallback((title, message, type = 'info') => {
        setModalContent({ title, message, type });
        setShowModal(true);
    }, []);

    // Firebase başlatma ve Admin kullanıcı kontrolü
    useEffect(() => {
        const initializeFirebase = async () => {
            try {
                // Firebase henüz başlatılmadıysa başlat
                if (!app) {
                    app = initializeApp(firebaseConfig);
                    db = getFirestore(app);
                    auth = getAuth(app);
                    setFirebaseInitialized(true);
                }

                // Kimlik doğrulama dinleyicisi
                const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
                    if (user) {
                        setUserId(user.uid);
                    } else {
                        // Eğer initialAuthToken varsa, custom token ile giriş yap (Sadece Canvas için)
                        if (initialAuthToken) {
                            await signInWithCustomToken(auth, initialAuthToken);
                        } else {
                            // Diğer durumlarda (local/Vercel) anonim olarak giriş yap
                            await signInAnonymously(auth);
                        }
                        // Anonim giriş sonrası veya custom token sonrası UID'yi al
                        setUserId(auth.currentUser?.uid || crypto.randomUUID());
                    }
                    setIsAuthReady(true);
                });

                // Admin kullanıcı bilgilerini kontrol et ve yoksa varsayılanı ekle
                // Bu işlem, uygulamanın ilk kez başlatılmasında veya admin bilgilerinin silinmesi durumunda çalışır.
                const adminDocRef = doc(db, `artifacts/${customAppId}/admin_settings/adminUser`); // Yol düzeltildi
                const adminDocSnap = await getDoc(adminDocRef);

                if (!adminDocSnap.exists()) {
                    await setDoc(adminDocRef, {
                        username: DEFAULT_ADMIN_USERNAME,
                        password: DEFAULT_ADMIN_PASSWORD, // Gerçek uygulamada şifre hashlenmeli
                        ownerId: auth.currentUser?.uid || 'default_owner' // Admin'in ilk oluşturanın UID'si
                    });
                    console.log("Varsayılan Admin kullanıcı bilgileri Firestore'a eklendi.");
                }


                // Tone.js ses bağlamını kullanıcı etkileşimiyle başlat
                // Bu event listener'lar, kullanıcı sayfayla ilk kez etkileşime girdiğinde Tone.js'i başlatır.
                // Bu, tarayıcıların otomatik ses çalma kısıtlamalarını aşmak için gereklidir.
                document.documentElement.addEventListener('mousedown', Tone.start);
                document.documentElement.addEventListener('touchstart', Tone.start);

                return () => {
                    unsubscribeAuth();
                    // Event listener'ları temizle
                    document.documentElement.removeEventListener('mousedown', Tone.start);
                    document.documentElement.removeEventListener('touchstart', Tone.start);
                };
            } catch (error) {
                console.error("Uygulama başlatılırken hata oluştu:", error);
                showMessage("Hata", "Uygulama başlatılırken bir sorun oluştu. Lütfen daha sonra tekrar deneyin.", "error");
                setIsAuthReady(true);
            }
        };

        if (!firebaseInitialized) {
            initializeFirebase();
        }
    }, [firebaseInitialized, showMessage]); // initialAuthToken bağımlılıklardan kaldırıldı

    if (!isAuthReady) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <div className="text-center p-6 bg-white rounded-lg shadow-md">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-lg text-gray-700">Yükleniyor...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-100 font-inter flex flex-col">
            {/* Modal Bileşeni */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className={`bg-white rounded-lg shadow-xl p-6 max-w-sm w-full transform transition-all duration-300 scale-100 ${modalContent.type === 'success' ? 'border-t-4 border-green-500' : modalContent.type === 'error' ? 'border-t-4 border-red-500' : 'border-t-4 border-blue-500'}`}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className={`text-xl font-semibold ${modalContent.type === 'success' ? 'text-green-700' : modalContent.type === 'error' ? 'text-red-700' : 'text-blue-700'}`}>
                                {modalContent.type === 'success' && <CheckCircle className="inline-block mr-2" />}
                                {modalContent.type === 'error' && <XCircle className="inline-block mr-2" />}
                                {modalContent.type === 'info' && <Info className="inline-block mr-2" />}
                                {modalContent.title}
                            </h3>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 focus:outline-none">
                                <XCircle size={24} />
                            </button>
                        </div>
                        <p className="text-gray-700 mb-6">{modalContent.message}</p>
                        <button
                            onClick={() => setShowModal(false)}
                            className={`w-full py-2 px-4 rounded-md text-white font-semibold transition-colors duration-200 ${modalContent.type === 'success' ? 'bg-green-600 hover:bg-green-700' : modalContent.type === 'error' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                        >
                            Tamam
                        </button>
                    </div>
                </div>
            )}

            {/* Navbar */}
            <nav className="bg-white shadow-md p-4 flex justify-between items-center sticky top-0 z-40">
                <h1 className="text-2xl font-bold text-gray-800 flex items-center">
                    <Coffee className="mr-2 text-blue-600" size={32} /> siparist
                </h1>
                {/* Navbar'daki Kasa ve Admin butonları kaldırıldı */}
            </nav>

            {/* Panel İçerikleri */}
            <main className="flex-grow p-6">
                {activePanel === 'customer' && <CustomerPanel db={db} userId={userId} showMessage={showMessage} customAppId={customAppId} />}
                {activePanel === 'cashier' && <CashierPanel db={db} userId={userId} showMessage={showMessage} customAppId={customAppId} />}
                {activePanel === 'admin' && <AdminPanel db={db} userId={userId} showMessage={showMessage} customAppId={customAppId} />}
            </main>

            {/* Footer */}
            <footer className="bg-gray-800 text-white p-4 text-center text-sm">
                <p>
                    &copy; {new Date().getFullYear()} siparist. Tüm Hakları Sakl
                    <span
                        className="cursor-pointer text-blue-400 hover:text-blue-200 transition-colors duration-200"
                        onClick={() => setActivePanel('admin')}
                    >
                        ı
                    </span>
                    d
                    <span
                        className="cursor-pointer text-blue-400 hover:text-blue-200 transition-colors duration-200"
                        onClick={() => setActivePanel('cashier')}
                    >
                        ı
                    </span>
                    r.
                </p>
            </footer>
        </div>
    );
}

// Müşteri Arayüzü Bileşeni
function CustomerPanel({ db, userId, showMessage, customAppId }) {
    const [menu, setMenu] = useState([]);
    const [cart, setCart] = useState([]);
    const [masaNo, setMasaNo] = useState(localStorage.getItem('siparist_masaNo') || '');
    const [customerName, setCustomerName] = useState(localStorage.getItem('siparist_customerName') || '');
    const [password, setPassword] = useState(''); // Şifre yerel depolamada tutulmaz, sadece doğrulamak için kullanılır
    const [sessionId, setSessionId] = useState(localStorage.getItem('siparist_sessionId') || '');
    const [showOrderForm, setShowOrderForm] = useState(false);
    const [showBillRequestForm, setShowBillRequestForm] = useState(false);
    const [loading, setLoading] = useState(true);
    const [customerOrders, setCustomerOrders] = useState([]);
    const [passwordValidated, setPasswordValidated] = useState(false); // Şifrenin bu oturumda doğrulanıp doğrulanmadığı

    // Müşterinin siparişlerini çek (hesap isteği için)
    const fetchCustomerOrders = useCallback(async (tableNum, custName, currentSessionID) => {
        if (!db || !tableNum || !custName || !currentSessionID) {
            setCustomerOrders([]); // Clear orders if not all info is present
            return;
        }
        try {
            const ordersRef = collection(db, `artifacts/${customAppId}/public/data/orders`);
            const q = query(ordersRef, 
                where("masaNo", "==", tableNum), 
                where("customerName", "==", custName),
                where("sessionId", "==", currentSessionID) // Filter by sessionId
            );
            const snapshot = await getDocs(q);
            const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCustomerOrders(ordersData);
        } catch (error) {
            console.error("Müşteri siparişleri çekilirken hata oluştu:", error);
            showMessage("Hata", "Siparişleriniz yüklenirken bir sorun oluştu.", "error");
        }
    }, [db, showMessage, customAppId]);

    // Kaydedilmiş oturum bilgilerini doğrula
    const validateStoredSession = useCallback(async () => { // useCallback ile sarmalandı
        if (db && masaNo && customerName && sessionId) {
            try {
                const passwordDocRef = doc(db, `artifacts/${customAppId}/public/data/passwords`, masaNo);
                const passwordDocSnap = await getDoc(passwordDocRef);

                if (passwordDocSnap.exists() && passwordDocSnap.data().sessionId === sessionId && passwordDocSnap.data().isActive) {
                    setPasswordValidated(true);
                    fetchCustomerOrders(masaNo, customerName, sessionId); // Siparişleri getir
                } else {
                    // Oturum geçersizse yerel depolamayı temizle
                    localStorage.removeItem('siparist_masaNo');
                    localStorage.removeItem('siparist_customerName');
                    localStorage.removeItem('siparist_sessionId');
                    setMasaNo('');
                    setCustomerName('');
                    setSessionId('');
                    setPasswordValidated(false);
                }
            } catch (error) {
                console.error("Kaydedilmiş oturum doğrulanırken hata:", error);
                localStorage.removeItem('siparist_masaNo');
                localStorage.removeItem('siparist_customerName');
                localStorage.removeItem('siparist_sessionId');
                setMasaNo('');
                setCustomerName('');
                setSessionId('');
                setPasswordValidated(false);
            }
        }
    }, [db, masaNo, customerName, sessionId, customAppId, fetchCustomerOrders]); // Bağımlılıklar eklendi

    // Menüyü Firebase'den çek
    useEffect(() => {
        if (!db) return;

        const menuRef = collection(db, `artifacts/${customAppId}/public/data/menu`);
        const unsubscribe = onSnapshot(menuRef, (snapshot) => {
            const menuData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Kategorilere göre grupla
            const groupedMenu = menuData.reduce((acc, item) => {
                const category = item.category || 'Diğer';
                if (!acc[category]) {
                    acc[category] = [];
                }
                acc[category].push(item);
                return acc;
            }, {});
            setMenu(groupedMenu);
            setLoading(false);
        }, (error) => {
            console.error("Menü çekilirken hata oluştu:", error);
            showMessage("Hata", "Menü yüklenirken bir sorun oluştu.", "error");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, showMessage, customAppId]);

    // Kaydedilmiş oturum bilgilerini doğrula useEffect'i
    useEffect(() => {
        validateStoredSession();
    }, [validateStoredSession]);


    const addToCart = (item) => {
        const existingItemIndex = cart.findIndex(cartItem => cartItem.id === item.id);
        if (existingItemIndex > -1) {
            const updatedCart = [...cart];
            updatedCart[existingItemIndex].quantity += 1;
            setCart(updatedCart);
        } else {
            setCart([...cart, { ...item, quantity: 1, note: '' }]);
        }
        showMessage("Sepete Eklendi", `${item.name} sepete eklendi.`, "success");
    };

    const updateCartItemQuantity = (id, delta) => {
        const updatedCart = cart.map(item =>
            item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
        ).filter(item => item.quantity > 0);
        setCart(updatedCart);
    };

    const removeCartItem = (id) => {
        setCart(cart.filter(item => item.id !== id));
        showMessage("Sepetten Çıkarıldı", "Ürün sepetten çıkarıldı.", "info");
    };

    const updateCartItemNote = (id, note) => {
        setCart(cart.map(item =>
            item.id === id ? { ...item, note } : item
        ));
    };

    const calculateTotal = (items) => {
        return (items || cart).reduce((total, item) => total + (item.price * item.quantity), 0).toFixed(2);
    };

    const handleOrderSubmit = async () => {
        let currentSessionId = sessionId; // Mevcut sessionId'yi kullan

        if (!passwordValidated) { // Eğer şifre daha önce doğrulanmadıysa
            if (!masaNo || !customerName || !password || cart.length === 0) {
                showMessage("Eksik Bilgi", "Lütfen masa numarası, adınız, şifre ve sepetinizi kontrol edin.", "error");
                return;
            }

            try {
                const passwordDocRef = doc(db, `artifacts/${customAppId}/public/data/passwords`, masaNo);
                const passwordDocSnap = await getDoc(passwordDocRef);

                if (!passwordDocSnap.exists() || passwordDocSnap.data().password !== password || !passwordDocSnap.data().isActive) {
                    showMessage("Hata", "Geçersiz Masa Numarası veya Şifre. Lütfen kontrol edin.", "error");
                    return;
                }
                currentSessionId = passwordDocSnap.data().sessionId;
                if (!currentSessionId) {
                    showMessage("Hata", "Masa oturum bilgisi bulunamadı. Lütfen kasa görevlisiyle iletişime geçin.", "error");
                    return;
                }

                // Şifre doğrulandı, bilgileri yerel depolamaya kaydet
                localStorage.setItem('siparist_masaNo', masaNo);
                localStorage.setItem('siparist_customerName', customerName);
                localStorage.setItem('siparist_sessionId', currentSessionId);
                setSessionId(currentSessionId);
                setPasswordValidated(true);

            } catch (error) {
                console.error("Sipariş gönderilirken şifre doğrulamada hata oluştu:", error);
                showMessage("Hata", "Siparişinizi gönderirken bir sorun oluştu. Lütfen tekrar deneyin.", "error");
                return;
            }
        }

        // Şifre doğrulandıysa veya zaten doğrulanmışsa siparişi kaydet
        try {
            await addDoc(collection(db, `artifacts/${customAppId}/public/data/orders`), {
                masaNo,
                customerName,
                sessionId: currentSessionId, // Doğrulanmış sessionId'yi kullan
                items: cart.map(item => ({
                    id: item.id,
                    name: item.name,
                    price: item.price,
                    quantity: item.quantity,
                    note: item.note,
                })),
                total: parseFloat(calculateTotal()),
                status: 'pending', // pending, delivered, paid
                orderDate: new Date().toISOString(),
            });

            showMessage("Siparişiniz Alındı", "Siparişiniz başarıyla alındı. Teşekkür ederiz!", "success");
            setCart([]);
            // MasaNo ve CustomerName'i sıfırlama, çünkü oturum devam ediyor olabilir
            // setMasaNo('');
            // setCustomerName('');
            setPassword(''); // Şifreyi sadece inputtan temizle
            setShowOrderForm(false);
        } catch (error) {
            console.error("Sipariş gönderilirken hata oluştu:", error);
            showMessage("Hata", "Siparişinizi gönderirken bir sorun oluştu. Lütfen tekrar deneyin.", "error");
        }
    };

    const handleBillRequestSubmit = async () => {
        let currentSessionId = sessionId; // Mevcut sessionId'yi kullan

        if (!passwordValidated) { // Eğer şifre daha önce doğrulanmadıysa
            if (!masaNo || !customerName || !password) {
                showMessage("Eksik Bilgi", "Lütfen masa numarası, adınız ve şifrenizi girin.", "error");
                return;
            }

            try {
                const passwordDocRef = doc(db, `artifacts/${customAppId}/public/data/passwords`, masaNo);
                const passwordDocSnap = await getDoc(passwordDocRef);

                if (!passwordDocSnap.exists() || passwordDocSnap.data().password !== password || !passwordDocSnap.data().isActive) {
                    showMessage("Hata", "Geçersiz Masa Numarası veya Şifre. Lütfen kontrol edin.", "error");
                    return;
                }
                currentSessionId = passwordDocSnap.data().sessionId;
                if (!currentSessionId) {
                    showMessage("Hata", "Masa oturum bilgisi bulunamadı. Lütfen kasa görevlisiyle iletişime geçin.", "error");
                    return;
                }

                // Şifre doğrulandı, bilgileri yerel depolamaya kaydet
                localStorage.setItem('siparist_masaNo', masaNo);
                localStorage.setItem('siparist_customerName', customerName);
                localStorage.setItem('siparist_sessionId', currentSessionId);
                setSessionId(currentSessionId);
                setPasswordValidated(true);

            } catch (error) {
                console.error("Hesap isteği gönderilirken şifre doğrulamada hata oluştu:", error);
                showMessage("Hata", "Hesap isteğinizi gönderirken bir sorun oluştu. Lütfen tekrar deneyin.", "error");
                return;
            }
        }

        // Şifre doğrulandıysa veya zaten doğrulanmışsa hesap isteğini kaydet
        try {
            await addDoc(collection(db, `artifacts/${customAppId}/public/data/billRequests`), {
                masaNo,
                customerName,
                sessionId: currentSessionId, // Doğrulanmış sessionId'yi kullan
                requestDate: new Date().toISOString(),
                status: 'pending', // pending, completed
            });

            showMessage("Hesap İsteğiniz Alındı", "Hesap isteğiniz başarıyla gönderildi. Garsonumuz kısa süre içinde masanıza gelecektir.", "success");
            setCart([]); // Hesap istendikten sonra sepeti boşalt
            setShowBillRequestForm(false);
        } catch (error) {
            console.error("Hesap isteği gönderilirken hata oluştu:", error);
            showMessage("Hata", "Hesap isteğinizi gönderirken bir sorun oluştu. Lütfen tekrar deneyin.", "error");
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100">
                <div className="text-center p-6 bg-white rounded-lg shadow-md">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                    <p className="text-lg text-gray-700">Menü Yükleniyor...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 bg-white rounded-lg shadow-lg">
            {/* Hesap İste Butonu - Her zaman görünür */}
            <div className="fixed top-20 right-6 z-30"> {/* Navbar'ın altına ve sağ üste sabitle */}
                <button
                    onClick={() => {
                        setShowBillRequestForm(true);
                        // Eğer zaten doğrulanmış bir oturum varsa, siparişleri otomatik çek
                        if (passwordValidated) {
                            fetchCustomerOrders(masaNo, customerName, sessionId);
                        }
                    }}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-3 rounded-full font-semibold transition-colors duration-200 shadow-lg hover:shadow-xl flex items-center text-lg"
                >
                    <DollarSign className="mr-2" size={24} /> Hesap İste
                </button>
            </div>

            <h2 className="text-3xl font-bold text-gray-800 mb-6 flex items-center">
                <Utensils className="mr-3 text-blue-600" size={30} /> Menü
            </h2>

            {Object.keys(menu).length === 0 ? (
                <p className="text-gray-600 text-lg text-center py-10">Menüde hiç ürün bulunmamaktadır.</p>
            ) : (
                Object.keys(menu).map(category => (
                    <div key={category} className="mb-8">
                        <h3 className="text-2xl font-semibold text-gray-700 mb-4 border-b-2 border-blue-200 pb-2 flex items-center">
                            <Coffee className="mr-2 text-blue-500" /> {category}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                            {menu[category].map(item => (
                                <div key={item.id} className="bg-gray-50 rounded-lg shadow-md overflow-hidden flex flex-col hover:shadow-xl transition-shadow duration-300">
                                    <img
                                        src={item.imageUrl || `https://placehold.co/400x250/a8dadc/1d3557?text=${item.name.replace(/\s/g, '+')}`}
                                        alt={item.name}
                                        className="w-full h-48 object-cover"
                                        onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/400x250/a8dadc/1d3557?text=${item.name.replace(/\s/g, '+')}`; }}
                                    />
                                    <div className="p-4 flex-grow flex flex-col justify-between">
                                        <div>
                                            <h4 className="text-xl font-bold text-gray-800 mb-1">{item.name}</h4>
                                            <p className="text-gray-600 text-sm mb-3">{item.description}</p>
                                        </div>
                                        <div className="flex justify-between items-center mt-auto">
                                            <span className="text-blue-600 text-lg font-bold">{item.price.toFixed(2)} TL</span>
                                            <button
                                                onClick={() => addToCart(item)}
                                                className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-md transition-colors duration-200 shadow-md hover:shadow-lg flex items-center"
                                            >
                                                <ShoppingCart className="mr-2" size={18} /> Sepete Ekle
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))
    )}

            <div className="mt-10 border-t-2 border-gray-200 pt-8">
                <h2 className="text-3xl font-bold text-gray-800 mb-6 flex items-center">
                    <ShoppingCart className="mr-3 text-blue-600" size={30} /> Sepetiniz
                </h2>
                {cart.length === 0 ? (
                    <p className="text-gray-600 text-lg text-center py-10">Sepetiniz boş.</p>
                ) : (
                    <>
                        <div className="space-y-4">
                            {cart.map(item => (
                                <div key={item.id} className="flex items-center bg-gray-50 p-4 rounded-lg shadow-sm">
                                    <img
                                        src={item.imageUrl || `https://placehold.co/60x60/a8dadc/1d3557?text=${item.name.replace(/\s/g, '+')}`}
                                        alt={item.name}
                                        className="w-16 h-16 object-cover rounded-md mr-4"
                                        onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/60x60/a8dadc/1d3557?text=${item.name.replace(/\s/g, '+')}`; }}
                                    />
                                    <div className="flex-grow">
                                        <h4 className="font-semibold text-gray-800">{item.name}</h4>
                                        <p className="text-gray-600 text-sm">{item.price.toFixed(2)} TL</p>
                                        <input
                                            type="text"
                                            placeholder="Özel not (örn: az şekerli)"
                                            value={item.note}
                                            onChange={(e) => updateCartItemNote(item.id, e.target.value)}
                                            className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-blue-500 focus:border-blue-500"
                                        />
                                    </div>
                                    <div className="flex items-center ml-4">
                                        <button onClick={() => updateCartItemQuantity(item.id, -1)} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded-l-md transition-colors duration-200">-</button>
                                        <span className="bg-gray-100 px-3 py-1 text-gray-800 font-medium">{item.quantity}</span>
                                        <button onClick={() => updateCartItemQuantity(item.id, 1)} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-3 py-1 rounded-r-md transition-colors duration-200">+</button>
                                        <button onClick={() => removeCartItem(item.id)} className="ml-3 text-red-500 hover:text-red-700 transition-colors duration-200">
                                            <Trash2 size={20} />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-6 flex justify-end items-center bg-blue-50 p-4 rounded-lg shadow-sm">
                            <span className="text-xl font-bold text-gray-800">Toplam: {calculateTotal()} TL</span>
                            <button
                                onClick={() => setShowOrderForm(true)}
                                className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-md font-semibold transition-colors duration-200 shadow-lg hover:shadow-xl flex items-center"
                            >
                                <Check className="mr-2" size={20} /> Siparişi Tamamla
                            </button>
                        </div>
                    </>
                )}
            </div>

            {showOrderForm && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full transform transition-all duration-300 scale-100">
                        <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">Sipariş Bilgileri</h3>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="masaNoOrder" className="block text-gray-700 text-sm font-semibold mb-2">Masa Numarası</label>
                                <input
                                    type="text"
                                    id="masaNoOrder"
                                    value={masaNo}
                                    onChange={(e) => setMasaNo(e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Masa numaranızı girin"
                                    disabled={passwordValidated} // Şifre doğrulandıysa devre dışı bırak
                                />
                            </div>
                            <div>
                                <label htmlFor="customerNameOrder" className="block text-gray-700 text-sm font-semibold mb-2">Adınız</label>
                                <input
                                    type="text"
                                    id="customerNameOrder"
                                    value={customerName}
                                    onChange={(e) => setCustomerName(e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Adınızı girin"
                                    disabled={passwordValidated} // Şifre doğrulandıysa devre dışı bırak
                                />
                            </div>
                            {!passwordValidated && ( // Şifre doğrulandıysa şifre alanını gizle
                                <div>
                                    <label htmlFor="passwordOrder" className="block text-gray-700 text-sm font-semibold mb-2">Masa Şifresi</label>
                                    <input
                                        type="text"
                                        id="passwordOrder"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="Masa şifrenizi girin (örn: 36soda55)"
                                    />
                                </div>
                            )}
                        </div>
                        <div className="mt-8 flex justify-end space-x-4">
                            <button
                                onClick={() => setShowOrderForm(false)}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-3 rounded-md font-semibold transition-colors duration-200"
                            >
                                İptal
                            </button>
                            <button
                                onClick={handleOrderSubmit}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-semibold transition-colors duration-200 shadow-md"
                            >
                                Siparişi Gönder
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showBillRequestForm && (
                <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full transform transition-all duration-300 scale-100">
                        <h3 className="text-2xl font-bold text-gray-800 mb-6 text-center">Hesap İste</h3>
                        <div className="space-y-4 mb-6">
                            <div>
                                <label htmlFor="masaNoBill" className="block text-gray-700 text-sm font-semibold mb-2">Masa Numarası</label>
                                <input
                                    type="text"
                                    id="masaNoBill"
                                    value={masaNo}
                                    onChange={async (e) => {
                                        setMasaNo(e.target.value);
                                        // Fetch sessionId based on masaNo and password for live order display
                                        if (e.target.value && password && customerName && db) {
                                            const passwordDocRef = doc(db, `artifacts/${customAppId}/public/data/passwords`, e.target.value);
                                            const passwordDocSnap = await getDoc(passwordDocRef);
                                            if (passwordDocSnap.exists() && passwordDocSnap.data().password === password && passwordDocSnap.data().isActive) {
                                                fetchCustomerOrders(e.target.value, customerName, passwordDocSnap.data().sessionId);
                                            } else {
                                                setCustomerOrders([]);
                                            }
                                        } else {
                                            setCustomerOrders([]);
                                        }
                                    }}
                                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Masa numaranızı girin"
                                    disabled={passwordValidated} // Şifre doğrulandıysa devre dışı bırak
                                />
                            </div>
                            <div>
                                <label htmlFor="customerNameBill" className="block text-gray-700 text-sm font-semibold mb-2">Adınız</label>
                                <input
                                    type="text"
                                    id="customerNameBill"
                                    value={customerName}
                                    onChange={async (e) => {
                                        setCustomerName(e.target.value);
                                        // Fetch sessionId based on masaNo and password for live order display
                                        if (masaNo && password && e.target.value && db) {
                                            const passwordDocRef = doc(db, `artifacts/${customAppId}/public/data/passwords`, masaNo);
                                            const passwordDocSnap = await getDoc(passwordDocRef);
                                            if (passwordDocSnap.exists() && passwordDocSnap.data().password === password && passwordDocSnap.data().isActive) {
                                                fetchCustomerOrders(masaNo, e.target.value, passwordDocSnap.data().sessionId);
                                            } else {
                                                setCustomerOrders([]);
                                            }
                                        } else {
                                            setCustomerOrders([]);
                                        }
                                    }}
                                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Adınızı girin"
                                    disabled={passwordValidated} // Şifre doğrulandıysa devre dışı bırak
                                />
                            </div>
                            {!passwordValidated && ( // Şifre doğrulandıysa şifre alanını gizle
                                <div>
                                    <label htmlFor="passwordBill" className="block text-gray-700 text-sm font-semibold mb-2">Masa Şifresi</label>
                                    <input
                                        type="text"
                                        id="passwordBill"
                                        value={password}
                                        onChange={async (e) => {
                                            setPassword(e.target.value);
                                            // Fetch sessionId based on masaNo and password for live order display
                                            if (masaNo && e.target.value && customerName && db) {
                                                const passwordDocRef = doc(db, `artifacts/${customAppId}/public/data/passwords`, masaNo);
                                                const passwordDocSnap = await getDoc(passwordDocRef);
                                                if (passwordDocSnap.exists() && passwordDocSnap.data().password === e.target.value && passwordDocSnap.data().isActive) {
                                                    fetchCustomerOrders(masaNo, customerName, passwordDocSnap.data().sessionId);
                                                } else {
                                                    setCustomerOrders([]);
                                                }
                                            } else {
                                                setCustomerOrders([]);
                                            }
                                        }}
                                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Masa şifrenizi girin"
                                />
                                </div>
                            )}
                        </div>

                        {customerOrders.length > 0 && (
                            <div className="bg-gray-100 p-4 rounded-md mb-6 max-h-48 overflow-y-auto">
                                <h4 className="font-semibold text-gray-800 mb-2">Siparişleriniz:</h4>
                                {customerOrders.map(order => (
                                    <div key={order.id} className="mb-3 p-3 border border-gray-200 rounded-md bg-white">
                                        <p className="text-sm font-medium text-gray-700">Sipariş Tarihi: {new Date(order.orderDate).toLocaleTimeString('tr-TR')}</p>
                                        <ul className="list-disc list-inside text-gray-600 text-sm">
                                            {order.items.map((item, idx) => (
                                                <li key={idx}>{item.quantity}x {item.name} ({item.price.toFixed(2)} TL) {item.note && `(${item.note})`}</li>
                                            ))}
                                        </ul>
                                        <p className="text-right font-bold text-blue-600">Toplam: {calculateTotal(order.items)} TL</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="mt-8 flex justify-end space-x-4">
                            <button
                                onClick={() => setShowBillRequestForm(false)}
                                className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-3 rounded-md font-semibold transition-colors duration-200"
                            >
                                İptal
                            </button>
                            <button
                                onClick={handleBillRequestSubmit}
                                className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-md font-semibold transition-colors duration-200 shadow-md"
                            >
                                Hesap İsteği Gönder
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Kasa Paneli Bileşeni
function CashierPanel({ db, userId, showMessage, customAppId }) {
    const [loggedIn, setLoggedIn] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [activeTab, setActiveTab] = useState('pending'); // pending, delivered, paid, passwords, archive
    const [pendingOrders, setPendingOrders] = useState([]);
    const [deliveredOrders, setDeliveredOrders] = useState([]);
    const [paidOrders, setPaidOrders] = useState([]);
    const [activePasswords, setActivePasswords] = useState([]); // Yeni state
    const [archivedOrders, setArchivedOrders] = useState([]); // Historical archives
    const [livePaidOrdersToday, setLivePaidOrdersToday] = useState([]); // Live paid orders for today
    const [newTableNo, setNewTableNo] = useState('');
    const [generatedPassword, setGeneratedPassword] = useState('');
    const [archiveDate, setArchiveDate] = useState(new Date().toISOString().split('T')[0]); // YYYY-MM-DD
    const [billRequests, setBillRequests] = useState([]); // Hesap istekleri
    const prevPendingOrderIds = useRef(new Set());
    const prevBillRequestIds = useRef(new Set());

    // Tone.js ses oluşturucuları
    const newOrderSynth = useRef(null);
    const billRequestSynth = useRef(null);

    useEffect(() => {
        if (typeof Tone !== 'undefined') { // window.Tone yerine doğrudan Tone kullanıldı
            newOrderSynth.current = new Tone.Synth().toDestination();
            billRequestSynth.current = new Tone.PolySynth(Tone.Synth).toDestination();
        }
    }, []);

    const playNewOrderSound = useCallback(() => {
        if (newOrderSynth.current) {
            newOrderSynth.current.triggerAttackRelease("C4", "8n"); // Basit bir bip sesi
        }
    }, []);

    const playBillRequestSound = useCallback(() => {
        if (billRequestSynth.current) {
            billRequestSynth.current.triggerAttackRelease(["C4", "E4", "G4"], "4n"); // Üçlü akor
        }
    }, []);

    // Kasa kullanıcısını doğrula
    const handleLogin = async () => {
        if (!db) return;
        try {
            const cashierUsersRef = collection(db, `artifacts/${customAppId}/users/${userId}/cashierUsers`);
            const q = query(cashierUsersRef, where("username", "==", username));
            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                const cashierUser = querySnapshot.docs[0].data();
                if (cashierUser.password === password) { // Şifre karşılaştırması (gerçekte hashlenmeli)
                    setLoggedIn(true);
                    showMessage("Başarılı", "Kasa paneline giriş yapıldı.", "success");
                } else {
                    showMessage("Hata", "Yanlış kullanıcı adı veya şifre.", "error");
                }
            } else {
                showMessage("Hata", "Yanlış kullanıcı adı veya şifre.", "error");
            }
        } catch (error) {
            console.error("Kasa girişi sırasında hata oluştu:", error);
            showMessage("Hata", "Giriş yapılırken bir sorun oluştu.", "error");
        }
    };

    // Siparişleri, şifreleri, hesap isteklerini ve BUGÜNÜN ÖDENEN SİPARİŞLERİNİ gerçek zamanlı dinle
    useEffect(() => {
        if (!db || !loggedIn) return;

        // Siparişleri dinle (pending, delivered, paid)
        const ordersRef = collection(db, `artifacts/${customAppId}/public/data/orders`);
        const unsubscribeOrders = onSnapshot(ordersRef, (snapshot) => {
            const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const currentPendingOrderIds = new Set(ordersData.filter(order => order.status === 'pending').map(order => order.id));
            const newOrders = [...currentPendingOrderIds].filter(id => !prevPendingOrderIds.current.has(id));

            if (newOrders.length > 0) {
                playNewOrderSound(); // Yeni sipariş sesi çal
            }
            prevPendingOrderIds.current = currentPendingOrderIds;

            setPendingOrders(ordersData.filter(order => order.status === 'pending'));
            setDeliveredOrders(ordersData.filter(order => order.status === 'delivered'));
            setPaidOrders(ordersData.filter(order => order.status === 'paid')); // This is for the 'Ödenenler' tab
        }, (error) => {
            console.error("Siparişler çekilirken hata oluştu:", error);
            showMessage("Hata", "Siparişler yüklenirken bir sorun oluştu.", "error");
        });

        // Aktif masa şifrelerini dinle
        const passwordsRef = collection(db, `artifacts/${customAppId}/public/data/passwords`);
        const qPasswords = query(passwordsRef, where("isActive", "==", true));
        const unsubscribePasswords = onSnapshot(qPasswords, (snapshot) => {
            const passwordsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setActivePasswords(passwordsData);
        }, (error) => {
            console.error("Aktif şifreler çekilirken hata oluştu:", error);
            showMessage("Hata", "Aktif masa şifreleri yüklenirken bir sorun oluştu.", "error");
        });

        // Hesap isteklerini dinle
        const billRequestsRef = collection(db, `artifacts/${customAppId}/public/data/billRequests`);
        const qBillRequests = query(billRequestsRef, where("status", "==", "pending"));
        const unsubscribeBillRequests = onSnapshot(qBillRequests, (snapshot) => {
            const billRequestsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            const currentBillRequestIds = new Set(billRequestsData.map(req => req.id));
            const newBillRequests = [...currentBillRequestIds].filter(id => !prevBillRequestIds.current.has(id));

            if (newBillRequests.length > 0) {
                playBillRequestSound(); // Hesap isteği sesi çal
            }
            prevBillRequestIds.current = currentBillRequestIds;

            setBillRequests(billRequestsData);
        }, (error) => {
            console.error("Hesap istekleri çekilirken hata oluştu:", error);
            showMessage("Hata", "Hesap istekleri yüklenirken bir sorun oluştu.", "error");
        });

        // Arşivlenmiş siparişleri çek (tüm geçmiş tarihler için)
        const archiveRef = collection(db, `artifacts/${customAppId}/users/${userId}/archivedOrders`);
        const unsubscribeArchive = onSnapshot(archiveRef, (snapshot) => {
            const archivedData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setArchivedOrders(archivedData);
        }, (error) => {
            console.error("Arşivlenmiş siparişler çekilirken hata oluştu:", error);
            showMessage("Hata", "Arşivlenmiş siparişler yüklenirken bir sorun oluştu.", "error");
        });


        return () => {
            unsubscribeOrders();
            unsubscribePasswords();
            unsubscribeBillRequests();
            unsubscribeArchive();
        };
    }, [db, loggedIn, userId, showMessage, playNewOrderSound, playBillRequestSound, customAppId]);

    // livePaidOrdersToday'i paidOrders'tan türet
    useEffect(() => {
        const todayISO = new Date().toISOString().split('T')[0];
        const filteredLivePaidOrders = paidOrders.filter(order => {
            const orderDateISO = new Date(order.orderDate).toISOString().split('T')[0];
            return orderDateISO === todayISO;
        });
        setLivePaidOrdersToday(filteredLivePaidOrders);
    }, [paidOrders]);


    // Günlük sıfırlama ve arşivleme kontrolü (Her sabah 05:00)
    useEffect(() => {
        if (!db || !loggedIn) return;

        const setupDailyReset = () => {
            const now = new Date();
            // eslint-disable-next-line no-unused-vars
            const lastResetDate = localStorage.getItem('lastResetDate'); // Bu değişken kullanılıyor, ESLint uyarısı için devre dışı bırakıldı
            const today = now.toISOString().split('T')[0]; // YYYY-MM-DD

            // Calculate time until next 05:00 AM
            const nextResetTime = new Date();
            nextResetTime.setDate(now.getDate());
            nextResetTime.setHours(5, 0, 0, 0); // Set to 05:00 AM today

            if (now.getHours() >= 5) {
                // If it's already past 05:00 AM today, schedule for 05:00 AM tomorrow
                nextResetTime.setDate(now.getDate() + 1);
            }

            const timeUntilReset = nextResetTime.getTime() - now.getTime();

            console.log(`Bir sonraki günlük sıfırlama şu tarihe ayarlandı: ${nextResetTime.toLocaleString('tr-TR')}`);

            const timeoutId = setTimeout(async () => {
                console.log("Günlük sıfırlama tetiklendi.");
                try {
                    // 1. Ödenen siparişleri al ve arşive taşı
                    const paidOrdersQuery = query(collection(db, `artifacts/${customAppId}/public/data/orders`), where("status", "==", "paid"));
                    const paidOrdersSnapshot = await getDocs(paidOrdersQuery);
                    const paidOrdersToArchive = paidOrdersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                    if (paidOrdersToArchive.length > 0) {
                        await addDoc(collection(db, `artifacts/${customAppId}/users/${userId}/archivedOrders`), {
                            archiveDate: today,
                            orders: paidOrdersToArchive,
                            totalRevenue: paidOrdersToArchive.reduce((sum, order) => sum + order.total, 0),
                            timestamp: new Date().toISOString()
                        });
                        console.log("Ödenen siparişler arşivlendi.");
                    }

                    // 2. Tüm siparişleri (pending, delivered, paid) Firestore'dan sil
                    const allOrdersQuery = query(collection(db, `artifacts/${customAppId}/public/data/orders`));
                    const allOrdersSnapshot = await getDocs(allOrdersQuery);
                    const batch = writeBatch(db); // writeBatch kullanarak atomik işlem
                    allOrdersSnapshot.docs.forEach(docSnap => {
                        batch.delete(docSnap.ref);
                    });
                    await batch.commit();
                    console.log("Tüm siparişler silindi.");

                    // 3. Tüm masa şifrelerini devre dışı bırak
                    const passwordsQuery = query(collection(db, `artifacts/${customAppId}/public/data/passwords`));
                    const passwordsSnapshot = await getDocs(passwordsQuery);
                    const passwordBatch = writeBatch(db);
                    passwordsSnapshot.docs.forEach(docSnap => {
                        passwordBatch.update(docSnap.ref, { isActive: false });
                    });
                    await passwordBatch.commit();
                    console.log("Tüm masa şifreleri devre dışı bırakıldı.");

                    // 4. Tüm hesap isteklerini tamamlandı olarak işaretle
                    const billRequestsQuery = query(collection(db, `artifacts/${customAppId}/public/data/billRequests`), where("status", "==", "pending"));
                    const billRequestsSnapshot = await getDocs(billRequestsQuery);
                    const billRequestBatch = writeBatch(db);
                    billRequestsSnapshot.docs.forEach(docSnap => {
                        billRequestBatch.update(docSnap.ref, { status: 'completed' });
                    });
                    await billRequestBatch.commit();
                    console.log("Tüm hesap istekleri tamamlandı olarak işaretlendi.");


                    localStorage.setItem('lastResetDate', today);
                    showMessage("Günlük Sıfırlama", "Siparişler arşivlendi ve sıfırlandı.", "success");
                } catch (error) {
                    console.error("Günlük sıfırlama sırasında hata oluştu:", error);
                    showMessage("Hata", `Günlük sıfırlama işlemi sırasında bir sorun oluştu: ${error.message}`, "error");
                } finally {
                    // Bir sonraki gün için yeniden zamanla
                    setupDailyReset();
                }
            }, timeUntilReset);

            return () => clearTimeout(timeoutId);
        };

        // İlk kontrol ve kurulum
        setupDailyReset();

    }, [db, loggedIn, userId, showMessage, customAppId]);

    const updateOrderStatus = async (orderId, newStatus) => {
        if (!db) return;
        try {
            const orderRef = doc(db, `artifacts/${customAppId}/public/data/orders`, orderId);
            await updateDoc(orderRef, { status: newStatus });
            showMessage("Sipariş Güncellendi", `Sipariş durumu "${newStatus}" olarak güncellendi.`, "success");

            // Eğer sipariş ödendi ise masa şifresini iptal et (sessionId bazında)
            if (newStatus === 'paid') {
                const order = [...pendingOrders, ...deliveredOrders, ...paidOrders].find(o => o.id === orderId);
                if (order && order.masaNo && order.sessionId) {
                    const passwordDocRef = doc(db, `artifacts/${customAppId}/public/data/passwords`, order.masaNo);
                    const passwordDocSnap = await getDoc(passwordDocRef);
                    if (passwordDocSnap.exists() && passwordDocSnap.data().sessionId === order.sessionId && passwordDocSnap.data().isActive) {
                         await updateDoc(passwordDocRef, { isActive: false });
                         showMessage("Şifre İptal Edildi", `Masa ${order.masaNo} şifresi iptal edildi.`, "info");
                    }
                }
            }
        } catch (error) {
            console.error("Sipariş durumu güncellenirken hata oluştu:", error);
            showMessage("Hata", "Sipariş durumu güncellenirken bir sorun oluştu.", "error");
        }
    };

    const handleBillRequestPaid = async (request) => { // Changed from handleBillRequestCompletion
        if (!db) return;
        try {
            const batch = writeBatch(db);

            // 1. Hesap isteğini tamamlandı olarak işaretle
            const requestRef = doc(db, `artifacts/${customAppId}/public/data/billRequests`, request.id);
            batch.update(requestRef, { status: 'completed' });

            // 2. İlgili masa ve sessionId'ye ait tüm bekleyen/teslim edilen siparişleri "paid" olarak işaretle
            const ordersQuery = query(
                collection(db, `artifacts/${customAppId}/public/data/orders`),
                where("masaNo", "==", request.masaNo),
                where("customerName", "==", request.customerName),
                where("sessionId", "==", request.sessionId), // Filter by sessionId
                where("status", "in", ["pending", "delivered"])
            );
            const ordersSnapshot = await getDocs(ordersQuery);
            ordersSnapshot.docs.forEach(orderDoc => {
                batch.update(orderDoc.ref, { status: 'paid' });
            });

            // 3. Masa şifresini devre dışı bırak (sessionId bazında)
            const passwordDocRef = doc(db, `artifacts/${customAppId}/public/data/passwords`, request.masaNo);
            const passwordDocSnap = await getDoc(passwordDocRef);
            if (passwordDocSnap.exists() && passwordDocSnap.data().sessionId === request.sessionId && passwordDocSnap.data().isActive) {
                batch.update(passwordDocRef, { isActive: false });
            }

            await batch.commit();
            showMessage("Hesap Ödendi", `Masa ${request.masaNo} için hesap ödendi ve siparişler tamamlandı.`, "success");
        } catch (error) {
            console.error("Hesap isteği tamamlanırken hata oluştu:", error);
            showMessage("Hata", "Hesap isteği tamamlanırken bir sorun oluştu. Lütfen tekrar deneyin.", "error");
        }
    };

    const generateNewPassword = async () => {
        if (!db || !newTableNo) {
            showMessage("Eksik Bilgi", "Lütfen masa numarasını girin.", "error");
            return;
        }

        const today = new Date();
        const monthDaySum = today.getMonth() + 1 + today.getDate(); // AY + GÜN
        const formattedMonthDaySum = String(monthDaySum).padStart(2, '0'); // 2 haneli olmasını sağla

        const randomDrink = randomDrinkNames[Math.floor(Math.random() * randomDrinkNames.length)];
        const randomNumber = String(Math.floor(Math.random() * 99) + 1).padStart(2, '0');

        const newPass = `${formattedMonthDaySum}${randomDrink}${randomNumber}`; // Yeni format: 36soda55
        const sessionId = crypto.randomUUID(); // Generate unique sessionId

        setGeneratedPassword(newPass);

        try {
            // Masa şifresini Firestore'a kaydet/güncelle
            const passwordDocRef = doc(db, `artifacts/${customAppId}/public/data/passwords`, newTableNo);
            await setDoc(passwordDocRef, {
                masaNo: newTableNo,
                password: newPass,
                isActive: true,
                sessionId: sessionId, // Store sessionId
                createdAt: new Date().toISOString(),
                expiresAt: new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 5, 0, 0).toISOString() // Ertesi gün 05:00
            });
            showMessage("Şifre Oluşturuldu", `Masa ${newTableNo} için yeni şifre: ${newPass}`, "success");
        } catch (error) {
            console.error("Şifre oluşturulurken hata oluştu:", error);
            showMessage("Hata", "Şifre oluşturulurken bir sorun oluştu.", "error");
        }
    };

    const renderOrderList = (orders, statusType) => (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {orders.length === 0 ? (
                <p className="text-gray-600 text-lg col-span-full text-center py-10">Burada hiç sipariş yok.</p>
            ) : (
                orders.map(order => (
                    <div key={order.id} className="bg-white rounded-lg shadow-md p-6 flex flex-col justify-between hover:shadow-xl transition-shadow duration-300">
                        <div>
                            <h4 className="text-xl font-bold text-gray-800 mb-2 flex items-center">
                                <Table className="mr-2 text-blue-500" /> Masa No: {order.masaNo} - <User className="ml-3 mr-2 text-blue-500" /> {order.customerName}
                            </h4>
                            <p className="text-gray-600 text-sm mb-3">Sipariş Tarihi: {new Date(order.orderDate).toLocaleString('tr-TR')}</p>
                            <ul className="list-disc list-inside text-gray-700 mb-4 space-y-1">
                                {order.items.map((item, idx) => (
                                    <li key={idx}>
                                        {item.quantity}x {item.name} ({item.price.toFixed(2)} TL)
                                        {item.note && <span className="text-sm text-gray-500 italic ml-2">({item.note})</span>}
                                    </li>
                                ))}
                            </ul>
                            <p className="text-lg font-bold text-blue-600">Toplam: {order.total.toFixed(2)} TL</p>
                            <p className="text-xs text-gray-400 mt-2">Oturum ID: {order.sessionId ? order.sessionId.substring(0, 8) + '...' : 'Yok'}</p>
                        </div>
                        <div className="mt-4 flex flex-col space-y-2">
                            {statusType === 'pending' && (
                                <button
                                    onClick={() => updateOrderStatus(order.id, 'delivered')}
                                    className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-md font-semibold transition-colors duration-200 shadow-md flex items-center justify-center"
                                >
                                    <Check className="mr-2" size={18} /> Teslim Edildi
                                </button>
                            )}
                            {(statusType === 'pending' || statusType === 'delivered') && (
                                <button
                                    onClick={() => updateOrderStatus(order.id, 'paid')}
                                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-semibold transition-colors duration-200 shadow-md flex items-center justify-center"
                                >
                                    <DollarSign className="mr-2" size={18} /> Ödendi
                                </button>
                            )}
                        </div>
                    </div>
                ))
            )}
        </div>
    );

    const renderArchiveContent = () => {
        const todayISO = new Date().toISOString().split('T')[0];
        let displayData = [];
        let totalRevenueForDisplay = 0;

        if (archiveDate === todayISO) {
            // Display live paid orders for today
            if (livePaidOrdersToday.length > 0) {
                totalRevenueForDisplay = livePaidOrdersToday.reduce((sum, order) => sum + order.total, 0);
                displayData.push({
                    archiveDate: todayISO,
                    orders: livePaidOrdersToday,
                    totalRevenue: totalRevenueForDisplay,
                    timestamp: new Date().toISOString() // Use current timestamp for live data
                });
            }
        } else {
            // Display historical archived data for the selected date
            const selectedArchiveEntry = archivedOrders.find(entry => entry.archiveDate === archiveDate);
            if (selectedArchiveEntry) {
                displayData.push(selectedArchiveEntry);
                totalRevenueForDisplay = selectedArchiveEntry.totalRevenue;
            }
        }

        if (displayData.length === 0) {
            return <p className="text-gray-600 text-lg col-span-full text-center py-10">Bu tarihe ait sipariş veya arşiv bulunmamaktadır.</p>;
        }

        return (
            <div className="space-y-6">
                {displayData.map(archiveEntry => (
                    <div key={archiveEntry.archiveDate} className="bg-gray-50 p-6 rounded-lg shadow-md print-area">
                        <h4 className="text-xl font-bold text-gray-800 mb-3">
                            {archiveEntry.archiveDate === todayISO ? "Bugünkü Ödenen Siparişler" : `Arşiv Tarihi: ${new Date(archiveEntry.archiveDate).toLocaleDateString('tr-TR')}`}
                        </h4>
                        <p className="text-lg font-bold text-green-700 mb-4">Toplam Hasılat: {archiveEntry.totalRevenue.toFixed(2)} TL</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {archiveEntry.orders.map(order => (
                                <div key={order.id} className="bg-white p-4 rounded-md shadow-sm border border-gray-200">
                                    <p className="font-semibold text-gray-800">Masa: {order.masaNo} - {order.customerName}</p>
                                    <p className="text-sm text-gray-600">Sipariş: {new Date(order.orderDate).toLocaleTimeString('tr-TR')}</p>
                                    <ul className="list-disc list-inside text-gray-700 text-sm mt-2">
                                        {order.items.map((item, idx) => (
                                            <li key={idx}>{item.quantity}x {item.name} ({item.price.toFixed(2)} TL) {item.note && `(${item.note})`}</li>
                                        ))}
                                    </ul>
                                    <p className="font-bold text-blue-600 mt-2">Toplam: {order.total.toFixed(2)} TL</p>
                                    <p className="text-xs text-gray-400 mt-2">Oturum ID: {order.sessionId ? order.sessionId.substring(0, 8) + '...' : 'Yok'}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    if (!loggedIn) {
        return (
            <div className="container mx-auto p-8 bg-white rounded-lg shadow-lg max-w-md mt-10">
                <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center flex items-center justify-center">
                    <LogIn className="mr-3 text-blue-600" size={30} /> Kasa Girişi
                </h2>
                <div className="space-y-4">
                    <div>
                        <label htmlFor="cashierUsername" className="block text-gray-700 text-sm font-semibold mb-2">Kullanıcı Adı</label>
                        <input
                            type="text"
                            id="cashierUsername"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Kullanıcı adınızı girin"
                        />
                    </div>
                    <div>
                        <label htmlFor="cashierPassword" className="block text-gray-700 text-sm font-semibold mb-2">Şifre</label>
                        <input
                            type="password"
                            id="cashierPassword"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Şifrenizi girin"
                        />
                    </div>
                    <button
                        onClick={handleLogin}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-semibold transition-colors duration-200 shadow-md flex items-center justify-center"
                    >
                        <LogIn className="mr-2" size={20} /> Giriş Yap
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 bg-white rounded-lg shadow-lg">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 flex items-center">
                <DollarSign className="mr-3 text-blue-600" size={30} /> Kasa Paneli
            </h2>

            <div className="mb-6 flex space-x-2 border-b border-gray-200 pb-2 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('pending')}
                    className={`px-5 py-2 rounded-t-md font-semibold transition-colors duration-200 ${activeTab === 'pending' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-blue-100 hover:text-blue-700'}`}
                >
                    <span className="flex items-center"><ShoppingCart className="mr-2" size={18} /> Siparişler ({pendingOrders.length})</span>
                </button>
                <button
                    onClick={() => setActiveTab('delivered')}
                    className={`px-5 py-2 rounded-t-md font-semibold transition-colors duration-200 ${activeTab === 'delivered' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-blue-100 hover:text-blue-700'}`}
                >
                    <span className="flex items-center"><Check className="mr-2" size={18} /> Teslim Edilenler ({deliveredOrders.length})</span>
                </button>
                <button
                    onClick={() => setActiveTab('paid')}
                    className={`px-5 py-2 rounded-t-md font-semibold transition-colors duration-200 ${activeTab === 'paid' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-blue-100 hover:text-blue-700'}`}
                >
                    <span className="flex items-center"><DollarSign className="mr-2" size={18} /> Ödenenler ({paidOrders.length})</span>
                </button>
                <button
                    onClick={() => setActiveTab('passwords')}
                    className={`px-5 py-2 rounded-t-md font-semibold transition-colors duration-200 ${activeTab === 'passwords' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-blue-100 hover:text-blue-700'}`}
                >
                    <span className="flex items-center"><Lock className="mr-2" size={18} /> Masa Şifreleri ({activePasswords.length})</span>
                </button>
                <button
                    onClick={() => setActiveTab('billRequests')}
                    className={`px-5 py-2 rounded-t-md font-semibold transition-colors duration-200 ${activeTab === 'billRequests' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-blue-100 hover:text-blue-700'}`}
                >
                    <span className="flex items-center"><Bell className="mr-2" size={18} /> Hesap İstekleri ({billRequests.length})</span>
                </button>
                <button
                    onClick={() => setActiveTab('archive')}
                    className={`px-5 py-2 rounded-t-md font-semibold transition-colors duration-200 ${activeTab === 'archive' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-blue-100 hover:text-blue-700'}`}
                >
                    <span className="flex items-center"><Archive className="mr-2" size={18} /> Arşiv</span>
                </button>
            </div>

            {/* Şifre Oluşturma Alanı */}
            <div className="bg-blue-50 p-6 rounded-lg shadow-inner mb-6 flex flex-col md:flex-row items-center justify-between space-y-4 md:space-y-0 md:space-x-4">
                <div className="flex-grow w-full md:w-auto">
                    <label htmlFor="newTableNo" className="block text-gray-700 text-sm font-semibold mb-2">Masa Numarası</label>
                    <input
                        type="text"
                        id="newTableNo"
                        value={newTableNo}
                        onChange={(e) => setNewTableNo(e.target.value)}
                        className="w-full p-3 border border-blue-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Yeni masa numarasını girin"
                    />
                </div>
                <button
                    onClick={generateNewPassword}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-md font-semibold transition-colors duration-200 shadow-md flex items-center justify-center w-full md:w-auto"
                >
                    <Lock className="mr-2" size={20} /> Geçici Masa Şifresi Oluştur
                </button>
                {generatedPassword && (
                    <div className="mt-4 md:mt-0 p-3 bg-white border border-dashed border-purple-400 rounded-md text-purple-800 font-mono text-lg text-center w-full md:w-auto">
                        <span className="font-bold">Şifre:</span> {generatedPassword}
                    </div>
                )}
            </div>

            {activeTab === 'pending' && renderOrderList(pendingOrders, 'pending')}
            {activeTab === 'delivered' && renderOrderList(deliveredOrders, 'delivered')}
            {activeTab === 'paid' && renderOrderList(paidOrders, 'paid')}
            {activeTab === 'passwords' && (
                <div className="mt-6">
                    <h3 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                        <Lock className="mr-2 text-blue-600" /> Aktif Masa Şifreleri
                    </h3>
                    {activePasswords.length === 0 ? (
                        <p className="text-gray-600 text-lg col-span-full text-center py-10">Aktif masa şifresi bulunmamaktadır.</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {activePasswords.map(pw => (
                                <div key={pw.id} className="bg-white rounded-lg shadow-md p-6 flex flex-col justify-between hover:shadow-xl transition-shadow duration-300">
                                    <h4 className="text-xl font-bold text-gray-800 mb-2 flex items-center">
                                        <Table className="mr-2 text-blue-500" /> Masa No: {pw.masaNo}
                                    </h4>
                                    <p className="font-mono text-lg text-purple-800 break-words">Şifre: {pw.password}</p>
                                    <p className="text-sm text-gray-600 mt-2">Oluşturulma: {new Date(pw.createdAt).toLocaleString('tr-TR')}</p>
                                    <p className="text-sm text-gray-600">Geçerlilik Sonu: {new Date(pw.expiresAt).toLocaleString('tr-TR')}</p>
                                    <p className="text-xs text-gray-400 mt-2">Oturum ID: {pw.sessionId ? pw.sessionId.substring(0, 8) + '...' : 'Yok'}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {activeTab === 'billRequests' && (
                <div className="mt-6">
                    <h3 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                        <Bell className="mr-2 text-blue-600" /> Hesap İstekleri
                    </h3>
                    {billRequests.length === 0 ? (
                        <p className="text-gray-600 text-lg col-span-full text-center py-10">Bekleyen hesap isteği bulunmamaktadır.</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {billRequests.map(request => (
                                <div key={request.id} className="bg-yellow-50 rounded-lg shadow-md p-6 flex flex-col justify-between hover:shadow-xl transition-shadow duration-300 border-l-4 border-yellow-500">
                                    <div>
                                        <h4 className="text-xl font-bold text-gray-800 mb-2 flex items-center">
                                            <Table className="mr-2 text-yellow-700" /> Masa No: {request.masaNo} - <User className="ml-3 mr-2 text-yellow-700" /> {request.customerName}
                                        </h4>
                                        <p className="text-gray-600 text-sm mb-3">İstek Tarihi: {new Date(request.requestDate).toLocaleString('tr-TR')}</p>
                                        <p className="text-lg font-semibold text-yellow-800">Durum: Beklemede</p>
                                        <p className="text-xs text-gray-400 mt-2">Oturum ID: {request.sessionId ? request.sessionId.substring(0, 8) + '...' : 'Yok'}</p>
                                    </div>
                                    <div className="mt-4">
                                        <button
                                            onClick={() => handleBillRequestPaid(request)} // Changed to handleBillRequestPaid
                                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md font-semibold transition-colors duration-200 shadow-md flex items-center justify-center w-full"
                                        >
                                            <DollarSign className="mr-2" size={18} /> Ödendi
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {activeTab === 'archive' && (
                <div className="mt-6">
                    <h3 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                        <Archive className="mr-2 text-blue-600" /> Arşivlenmiş Siparişler
                    </h3>
                    <div className="mb-4 flex items-center space-x-3">
                        <label htmlFor="archiveDate" className="text-gray-700 font-semibold">Tarih Seç:</label>
                        <input
                            type="date"
                            id="archiveDate"
                            value={archiveDate}
                            onChange={(e) => setArchiveDate(e.target.value)}
                            className="p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                        />
                        <button
                            onClick={() => window.print()}
                            className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded-md font-semibold transition-colors duration-200 shadow-md flex items-center"
                        >
                            <Printer className="mr-2" size={18} /> Yazdır / PDF
                        </button>
                    </div>
                    {renderArchiveContent()}
                </div>
            )}
        </div>
    );
}

// Admin Paneli Bileşeni
function AdminPanel({ db, userId, showMessage, customAppId }) {
    const [loggedIn, setLoggedIn] = useState(false);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [activeTab, setActiveTab] = useState('menu'); // menu, cashierUsers
    const [menuCategories, setMenuCategories] = useState([]);
    const [menuItems, setMenuItems] = useState([]);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [editingItem, setEditingItem] = useState(null); // {id, ...itemData}
    const [newItem, setNewItem] = useState({ name: '', price: '', description: '', imageUrl: '', category: '' });
    const [cashierUsers, setCashierUsers] = useState([]);
    const [newCashier, setNewCashier] = useState({ username: '', password: '' });
    const [editingCashier, setEditingCashier] = useState(null); // {id, ...userData}

    // Admin giriş bilgileri için state'ler
    const [adminUsername, setAdminUsername] = useState('');
    const [adminPassword, setAdminPassword] = useState('');

    // Admin kullanıcı bilgilerini Firestore'dan çek
    useEffect(() => {
        if (!db || !userId) return; // userId'nin tanımlı olduğundan emin ol

        const adminDocRef = doc(db, `artifacts/${customAppId}/admin_settings/adminUser`);
        const unsubscribeAdmin = onSnapshot(adminDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setAdminUsername(data.username);
                setAdminPassword(data.password);
            } else {
                // Varsayılan admin bilgilerini ayarla (sadece UI için, Firestore'a zaten ekleniyor)
                setAdminUsername(DEFAULT_ADMIN_USERNAME);
                setAdminPassword(DEFAULT_ADMIN_PASSWORD);
            }
        }, (error) => {
            console.error("Admin bilgileri çekilirken hata oluştu:", error);
            showMessage("Hata", "Admin bilgileri yüklenirken bir sorun oluştu.", "error");
        });

        return () => unsubscribeAdmin();
    }, [db, userId, showMessage, customAppId]); // userId bağımlılık olarak eklendi


    // Admin girişi
    const handleLogin = async () => {
        if (!db) return;
        try {
            const adminDocRef = doc(db, `artifacts/${customAppId}/admin_settings/adminUser`);
            const adminDocSnap = await getDoc(adminDocRef);

            if (adminDocSnap.exists()) {
                const adminData = adminDocSnap.data();
                if (username === adminData.username && password === adminData.password) {
                    setLoggedIn(true);
                    showMessage("Başarılı", "Admin paneline giriş yapıldı.", "success");
                } else {
                    showMessage("Hata", "Yanlış kullanıcı adı veya şifre.", "error");
                }
            } else {
                showMessage("Hata", "Admin kullanıcı bilgileri bulunamadı. Lütfen uygulamayı yeniden başlatın veya geliştiriciyle iletişime geçin.", "error");
            }
        } catch (error) {
            console.error("Admin girişi sırasında hata oluştu:", error);
            showMessage("Hata", "Giriş yapılırken bir sorun oluştu.", "error");
        }
    };

    // Menü kategorilerini ve ürünlerini çek
    useEffect(() => {
        if (!db || !loggedIn) return;

        // Kategorileri çek
        const menuRef = collection(db, `artifacts/${customAppId}/public/data/menu`);
        const unsubscribe = onSnapshot(menuRef, (snapshot) => {
            const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMenuItems(items);
            // Benzersiz kategorileri al
            const categories = [...new Set(items.map(item => item.category || 'Diğer'))];
            setMenuCategories(categories.map(name => ({ id: name, name }))); // Basit bir ID ataması
        }, (error) => {
            console.error("Menü çekilirken hata oluştu:", error);
            showMessage("Hata", "Menü yüklenirken bir sorun oluştu.", "error");
        });

        // Kasa kullanıcılarını çek
        const cashierUsersRef = collection(db, `artifacts/${customAppId}/users/${userId}/cashierUsers`);
        const unsubscribeCashiers = onSnapshot(cashierUsersRef, (snapshot) => {
            const users = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setCashierUsers(users);
            // Eğer kasa kullanıcısı varsa ilkini varsayılan olarak ayarla
            if (users.length > 0) {
                // setCurrentCashierUsername(users[0].username); // Bu artık Admin Panelinde yönetiliyor
                // setCurrentCashierPassword(users[0].password); // Bu artık Admin Panelinde yönetiliyor
            } else {
                // setCurrentCashierUsername('');
                // setCurrentCashierPassword('');
            }
        }, (error) => {
            console.error("Kasa kullanıcıları çekilirken hata oluştu:", error);
            showMessage("Hata", "Kasa kullanıcıları yüklenirken bir sorun oluştu.", "error");
        });

        return () => {
            unsubscribe();
            unsubscribeCashiers();
        };
    }, [db, loggedIn, userId, showMessage, customAppId]);

    // Admin Panelinde Admin giriş bilgilerini güncelle
    const handleUpdateAdminCredentials = async () => {
        if (!db || !adminUsername || !adminPassword) {
            showMessage("Eksik Bilgi", "Lütfen Admin kullanıcı adı ve şifresini girin.", "error");
            return;
        }
        try {
            const adminDocRef = doc(db, `artifacts/${customAppId}/admin_settings/adminUser`); // Yol düzeltildi
            await updateDoc(adminDocRef, {
                username: adminUsername,
                password: adminPassword
            });
            showMessage("Başarılı", "Admin paneli giriş bilgileri güncellendi.", "success");
        } catch (error) {
            console.error("Admin paneli giriş bilgileri güncellenirken hata oluştu:", error);
            showMessage("Hata", "Admin paneli giriş bilgileri güncellenirken bir sorun oluştu.", "error");
        }
    };

    // Ürün işlemleri
    const handleAddOrUpdateItem = async () => {
        if (!db || !newItem.name || !newItem.price) {
            showMessage("Eksik Bilgi", "Lütfen ürün adı ve fiyatını girin.", "error");
            return;
        }

        let finalCategory = newItem.category;
        if (newItem.category === 'Yeni Kategori Ekle') {
            if (!newCategoryName.trim()) {
                showMessage("Eksik Bilgi", "Lütfen yeni kategori adını girin.", "error");
                return;
            }
            finalCategory = newCategoryName.trim();
        } else if (!newItem.category) { // Eğer kategori seçilmemişse ve "Yeni Kategori Ekle" de seçilmemişse
            showMessage("Eksik Bilgi", "Lütfen bir kategori seçin veya yeni bir kategori girin.", "error");
            return;
        }

        try {
            const itemToSave = { ...newItem, price: parseFloat(newItem.price), category: finalCategory };

            if (editingItem) {
                const itemRef = doc(db, `artifacts/${customAppId}/public/data/menu`, editingItem.id);
                await updateDoc(itemRef, itemToSave);
                showMessage("Başarılı", "Ürün güncellendi.", "success");
                setEditingItem(null);
            } else {
                await addDoc(collection(db, `artifacts/${customAppId}/public/data/menu`), itemToSave);
                showMessage("Başarılı", "Ürün eklendi.", "success");
            }
            // İlgili tüm state'leri sıfırlama
            setNewItem({ name: '', price: '', description: '', imageUrl: '', category: '' });
            setNewCategoryName(''); // Yeni kategori adı inputunu temizle
        } catch (error) {
            console.error("Ürün eklenirken/güncellenirken hata oluştu:", error);
            showMessage("Hata", "Ürün eklenirken/güncellenirken bir sorun oluştu.", "error");
        }
    };

    const handleDeleteItem = async (itemId) => {
        if (!db) return;
        if (!window.confirm("Bu ürünü silmek istediğinizden emin misiniz?")) return;
        try {
            await deleteDoc(doc(db, `artifacts/${customAppId}/public/data/menu`, itemId));
            showMessage("Başarılı", "Ürün silindi.", "success");
        } catch (error) {
            console.error("Ürün silinirken hata oluştu:", error);
            showMessage("Hata", "Ürün silinirken bir sorun oluştu.", "error");
        }
    };

    // Kasa kullanıcı işlemleri
    const handleAddOrUpdateCashier = async () => {
        if (!db || !newCashier.username || !newCashier.password) {
            showMessage("Eksik Bilgi", "Lütfen kullanıcı adı ve şifre girin.", "error");
            return;
        }
        try {
            if (editingCashier) {
                const cashierRef = doc(db, `artifacts/${customAppId}/users/${userId}/cashierUsers`, editingCashier.id);
                await updateDoc(cashierRef, newCashier);
                showMessage("Başarılı", "Kasa kullanıcısı güncellendi.", "success");
                setEditingCashier(null);
            } else {
                await addDoc(collection(db, `artifacts/${customAppId}/users/${userId}/cashierUsers`), newCashier);
                showMessage("Başarılı", "Kasa kullanıcısı eklendi.", "success");
            }
            setNewCashier({ username: '', password: '' });
        } catch (error) {
            console.error("Kasa kullanıcısı eklenirken/güncellenirken hata oluştu:", error);
            showMessage("Hata", "Kasa kullanıcısı eklenirken/güncellenirken bir sorun oluştu.", "error");
        }
    };

    const handleDeleteCashier = async (cashierId) => {
        if (!db) return;
        if (!window.confirm("Bu kasa kullanıcısını silmek istediğinizden emin misiniz?")) return;
        try {
            await deleteDoc(doc(db, `artifacts/${customAppId}/users/${userId}/cashierUsers`, cashierId));
            showMessage("Başarılı", "Kasa kullanıcısı silindi.", "success");
        } catch (error) {
            console.error("Kasa kullanıcısı silinirken hata oluştu:", error);
            showMessage("Hata", "Kasa kullanıcısı silinirken bir sorun oluştu.", "error");
        }
    };

    if (!loggedIn) {
        return (
            <div className="container mx-auto p-8 bg-white rounded-lg shadow-lg max-w-md mt-10">
                <h2 className="text-3xl font-bold text-gray-800 mb-6 text-center flex items-center justify-center">
                    <LogIn className="mr-3 text-blue-600" size={30} /> Admin Girişi
                </h2>
                <div className="space-y-4">
                    <div>
                        <label htmlFor="adminUsername" className="block text-gray-700 text-sm font-semibold mb-2">Kullanıcı Adı</label>
                        <input
                            type="text"
                            id="adminUsername"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Admin kullanıcı adını girin"
                        />
                    </div>
                    <div>
                        <label htmlFor="adminPassword" className="block text-gray-700 text-sm font-semibold mb-2">Şifre</label>
                        <input
                            type="password"
                            id="adminPassword"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Admin şifresini girin"
                        />
                    </div>
                    <button
                        onClick={handleLogin}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-semibold transition-colors duration-200 shadow-md flex items-center justify-center"
                    >
                        <LogIn className="mr-2" size={20} /> Giriş Yap
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-4 bg-white rounded-lg shadow-lg">
            <h2 className="text-3xl font-bold text-gray-800 mb-6 flex items-center">
                <Settings className="mr-3 text-blue-600" size={30} /> Admin Paneli
            </h2>

            <div className="mb-6 flex space-x-2 border-b border-gray-200 pb-2 overflow-x-auto">
                <button
                    onClick={() => setActiveTab('menu')}
                    className={`px-5 py-2 rounded-t-md font-semibold transition-colors duration-200 ${activeTab === 'menu' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-blue-100 hover:text-blue-700'}`}
                >
                    <span className="flex items-center"><Utensils className="mr-2" size={18} /> Menü Yönetimi</span>
                </button>
                <button
                    onClick={() => setActiveTab('cashierUsers')}
                    className={`px-5 py-2 rounded-t-md font-semibold transition-colors duration-200 ${activeTab === 'cashierUsers' ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-200 text-gray-700 hover:bg-blue-100 hover:text-blue-700'}`}
                >
                    <span className="flex items-center"><User className="mr-2" size={18} /> Kasa Kullanıcıları</span>
                </button>
            </div>

            {activeTab === 'menu' && (
                <div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                        <Utensils className="mr-2 text-blue-600" /> Ürün Yönetimi
                    </h3>
                    <div className="bg-blue-50 p-6 rounded-lg shadow-inner mb-6">
                        <h4 className="text-xl font-semibold text-gray-800 mb-4">{editingItem ? 'Ürün Düzenle' : 'Yeni Ürün Ekle'}</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label htmlFor="itemName" className="block text-gray-700 text-sm font-semibold mb-2">Ürün Adı</label>
                                <input
                                    type="text"
                                    id="itemName"
                                    value={newItem.name}
                                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Ürün adını girin"
                                />
                            </div>
                            <div>
                                <label htmlFor="itemPrice" className="block text-gray-700 text-sm font-semibold mb-2">Fiyat (TL)</label>
                                <input
                                    type="number"
                                    id="itemPrice"
                                    value={newItem.price}
                                    onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Fiyatı girin"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label htmlFor="itemDescription" className="block text-gray-700 text-sm font-semibold mb-2">Açıklama</label>
                                <textarea
                                    id="itemDescription"
                                    value={newItem.description}
                                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Ürün açıklamasını girin"
                                    rows="2"
                                ></textarea>
                            </div>
                            <div className="md:col-span-2">
                                <label htmlFor="itemImageUrl" className="block text-gray-700 text-sm font-semibold mb-2">Görsel URL</label>
                                <input
                                    type="text"
                                    id="itemImageUrl"
                                    value={newItem.imageUrl}
                                    onChange={(e) => setNewItem({ ...newItem, imageUrl: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Ürün görsel URL'sini girin"
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label htmlFor="itemCategory" className="block text-gray-700 text-sm font-semibold mb-2">Kategori</label>
                                <select
                                    id="itemCategory"
                                    value={newItem.category}
                                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white"
                                >
                                    <option value="">Kategori Seçin</option>
                                    {menuCategories.map(cat => (
                                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                                    ))}
                                    <option value="Yeni Kategori Ekle">Yeni Kategori Ekle...</option>
                                </select>
                                {newItem.category === 'Yeni Kategori Ekle' && (
                                    <input
                                        type="text"
                                        className="mt-2 w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                        placeholder="Yeni kategori adını girin"
                                        value={newCategoryName}
                                        onChange={(e) => setNewCategoryName(e.target.value)}
                                    />
                                )}
                            </div>
                        </div>
                        <div className="flex justify-end space-x-3">
                            {editingItem && (
                                <button
                                    onClick={() => {
                                        setEditingItem(null);
                                        setNewItem({ name: '', price: '', description: '', imageUrl: '', category: '' });
                                        setNewCategoryName(''); // Yeni kategori adı inputunu temizle
                                    }}
                                    className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-3 rounded-md font-semibold transition-colors duration-200"
                                >
                                    İptal
                                </button>
                            )}
                            <button
                                onClick={handleAddOrUpdateItem}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-semibold transition-colors duration-200 shadow-md flex items-center"
                            >
                                {editingItem ? <Check className="mr-2" size={20} /> : <Plus className="mr-2" size={20} />}
                                {editingItem ? 'Ürünü Güncelle' : 'Ürün Ekle'}
                            </button>
                        </div>
                    </div>

                    <h3 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                        <Utensils className="mr-2 text-blue-600" /> Mevcut Ürünler
                    </h3>
                    {menuItems.length === 0 ? (
                        <p className="text-gray-600 text-lg text-center py-10">Henüz hiç ürün eklenmedi.</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {menuItems.map(item => (
                                <div key={item.id} className="bg-white rounded-lg shadow-md overflow-hidden flex flex-col hover:shadow-xl transition-shadow duration-300">
                                    <img
                                        src={item.imageUrl || `https://placehold.co/400x250/a8dadc/1d3557?text=${item.name.replace(/\s/g, '+')}`}
                                        alt={item.name}
                                        className="w-full h-48 object-cover"
                                        onError={(e) => { e.target.onerror = null; e.target.src = `https://placehold.co/400x250/a8dadc/1d3557?text=${item.name.replace(/\s/g, '+')}`; }}
                                    />
                                    <div className="p-4 flex-grow flex flex-col justify-between">
                                        <div>
                                            <h4 className="text-xl font-bold text-gray-800 mb-1">{item.name}</h4>
                                            <p className="text-gray-600 text-sm mb-2">{item.description}</p>
                                            <p className="text-gray-700 text-sm font-semibold">Kategori: {item.category || 'Belirtilmemiş'}</p>
                                        </div>
                                        <div className="flex justify-between items-center mt-auto pt-3 border-t border-gray-100">
                                            <span className="text-blue-600 text-lg font-bold">{item.price.toFixed(2)} TL</span>
                                            <div className="flex space-x-2">
                                                <button
                                                    onClick={() => {
                                                        setEditingItem(item);
                                                        setNewItem({ ...item, price: item.price.toString() }); // Fiyatı string olarak ayarla
                                                    }}
                                                    className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded-md transition-colors duration-200 shadow-sm"
                                                >
                                                    Düzenle
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteItem(item.id)}
                                                    className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md transition-colors duration-200 shadow-sm"
                                                >
                                                    Sil
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'cashierUsers' && (
                <div>
                    <h3 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                        <User className="mr-2 text-blue-600" /> Kasa Kullanıcıları Yönetimi
                    </h3>
                    <div className="bg-blue-50 p-6 rounded-lg shadow-inner mb-6">
                        <h4 className="text-xl font-semibold text-gray-800 mb-4">Kasa Giriş Bilgilerini Güncelle</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label htmlFor="newCashierUsername" className="block text-gray-700 text-sm font-semibold mb-2">Kullanıcı Adı</label>
                                <input
                                    type="text"
                                    id="newCashierUsername"
                                    value={newCashier.username}
                                    onChange={(e) => setNewCashier({ ...newCashier, username: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Kullanıcı adı"
                                />
                            </div>
                            <div>
                                <label htmlFor="newCashierPassword" className="block text-gray-700 text-sm font-semibold mb-2">Şifre</label>
                                <input
                                    type="password"
                                    id="newCashierPassword"
                                    value={newCashier.password}
                                    onChange={(e) => setNewCashier({ ...newCashier, password: e.target.value })}
                                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Şifre"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end space-x-3">
                            {editingCashier && (
                                <button
                                    onClick={() => {
                                        setEditingCashier(null);
                                        setNewCashier({ username: '', password: '' });
                                    }}
                                    className="bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-3 rounded-md font-semibold transition-colors duration-200"
                                >
                                    İptal
                                </button>
                            )}
                            <button
                                onClick={handleAddOrUpdateCashier}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-semibold transition-colors duration-200 shadow-md flex items-center"
                            >
                                {editingCashier ? <Check className="mr-2" size={20} /> : <Plus className="mr-2" size={20} />}
                                {editingCashier ? 'Kullanıcıyı Güncelle' : 'Kullanıcı Ekle'}
                            </button>
                        </div>
                    </div>

                    <h4 className="text-xl font-semibold text-gray-800 mb-4">Mevcut Kasa Kullanıcıları</h4>
                    {cashierUsers.length === 0 ? (
                        <p className="text-gray-600 text-lg text-center py-10">Henüz hiç kasa kullanıcısı eklenmedi.</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {cashierUsers.map(user => (
                                <div key={user.id} className="bg-white p-4 rounded-lg shadow-md flex items-center justify-between hover:shadow-xl transition-shadow duration-300">
                                    <div>
                                        <p className="font-semibold text-gray-800">{user.username}</p>
                                        <p className="text-sm text-gray-600">Şifre: {user.password}</p> {/* Gerçek uygulamada şifre gösterilmemeli */}
                                    </div>
                                    <div className="flex space-x-2">
                                        <button
                                            onClick={() => {
                                                setEditingCashier(user);
                                                setNewCashier({ username: user.username, password: user.password });
                                            }}
                                            className="bg-yellow-500 hover:bg-yellow-600 text-white px-3 py-1 rounded-md transition-colors duration-200 shadow-sm"
                                >
                                            Düzenle
                                        </button>
                                        <button
                                            onClick={() => handleDeleteCashier(user.id)}
                                            className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md transition-colors duration-200 shadow-sm"
                                        >
                                            Sil
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="mt-8 border-t-2 border-gray-200 pt-6">
                        <h3 className="text-2xl font-bold text-gray-800 mb-4 flex items-center">
                            <Lock className="mr-2 text-blue-600" /> Admin Giriş Bilgileri
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label htmlFor="adminLoginUsername" className="block text-gray-700 text-sm font-semibold mb-2">Admin Kullanıcı Adı</label>
                                <input
                                    type="text"
                                    id="adminLoginUsername"
                                    value={adminUsername}
                                    onChange={(e) => setAdminUsername(e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Admin kullanıcı adını girin"
                                />
                            </div>
                            <div>
                                <label htmlFor="adminLoginPassword" className="block text-gray-700 text-sm font-semibold mb-2">Admin Şifre</label>
                                <input
                                    type="password"
                                    id="adminLoginPassword"
                                    value={adminPassword}
                                    onChange={(e) => setAdminPassword(e.target.value)}
                                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                                    placeholder="Admin şifresini girin"
                                />
                            </div>
                        </div>
                        <div className="flex justify-end">
                            <button
                                onClick={handleUpdateAdminCredentials}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-md font-semibold transition-colors duration-200 shadow-md flex items-center"
                            >
                                <Check className="mr-2" size={20} /> Bilgileri Güncelle
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default App;
