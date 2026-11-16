/**
 * Dictionnaires de traduction FR / AR.
 *
 * Les clés sont organisées par domaine (login, nav, common, …) et résolues par
 * chemin pointé dans `useI18n().t('login.firstName')`. L'arabe active le RTL
 * (attribut `dir` sur <html>). Cette première tranche couvre la connexion et la
 * navigation ; les écrans restants seront traduits par lots successifs.
 */

export type Language = 'fr' | 'ar';

export const DEFAULT_LANGUAGE: Language = 'fr';

export type TranslationKey =
  | 'common.appName'
  | 'common.tagline'
  | 'common.back'
  | 'common.cancel'
  | 'common.close'
  | 'common.loading'
  | 'common.previous'
  | 'common.next'
  | 'common.skip'
  | 'common.validate'
  | 'common.finish'
  | 'common.print'
  | 'common.retry'
  | 'common.exercise'
  | 'common.question'
  | 'common.navigation'
  | 'common.search'
  | 'common.show'
  | 'common.showAll'
  | 'common.hide'
  | 'common.correction'
  | 'common.startCorrection'
  | 'common.showCorrection'
  | 'common.showMore'
  | 'common.reduce'
  | 'common.returnToHub'
  | 'common.correctAnswer'
  | 'common.yourChoice'
  | 'common.incorrectAnswer'
  | 'common.true'
  | 'common.false'
  | 'common.moveUpItem'
  | 'common.moveDownItem'
  | 'common.orderCorrect'
  | 'common.orderIncorrect'
  | 'common.chooseErrorStep'
  | 'revision.objectiveCompleted'
  | 'revision.sessionValidated'
  | 'revision.finishSession'
  | 'revision.allSessionsValidated'
  | 'revision.validationSaved'
  | 'revision.clickToValidate'
  | 'quiz.retryMistakes'
  | 'quiz.retryMistakesShort'
  | 'quiz.reviewAll'
  | 'quiz.startExercises'
  | 'common.continue'
  | 'common.quit'
  | 'common.restart'
  | 'common.saveAndQuit'
  | 'common.abandon'
  | 'common.startExam'
  | 'common.viewResults'
  | 'login.welcome'
  | 'login.lycee'
  | 'login.college'
  | 'login.student'
  | 'login.teacher'
  | 'login.teacherNote'
  | 'login.firstName'
  | 'login.firstNamePlaceholder'
  | 'login.lastName'
  | 'login.lastNamePlaceholder'
  | 'login.phone'
  | 'login.password'
  | 'login.passwordPlaceholder'
  | 'login.classLabel'
  | 'login.classLabelTeacher'
  | 'login.selectClass'
  | 'login.submit'
  | 'login.submitting'
  | 'login.alreadyRegistered'
  | 'login.reconnect'
  | 'login.welcomeBack'
  | 'login.yourNumber'
  | 'login.reconnectButton'
  | 'login.continueLearning'
  | 'login.changeAccount'
  | 'nav.messages'
  | 'nav.orientation'
  | 'nav.orientationShort'
  | 'nav.help'
  | 'nav.settings'
  | 'nav.settingsShort'
  | 'nav.logout'
  | 'nav.history';

type Dictionary = Record<TranslationKey, string>;

const fr: Dictionary = {
  'common.appName': 'Apprendre intelligemen',
  'common.tagline': "L'Excellence Sans Limite",
  'common.back': 'Retour',
  'common.cancel': 'Annuler',
  'common.close': 'Fermer',
  'common.loading': 'Chargement…',
  'common.previous': 'Précédent',
  'common.next': 'Suivant',
  'common.skip': 'Passer',
  'common.validate': 'Valider',
  'common.finish': 'Terminer',
  'common.print': 'Imprimer',
  'common.retry': 'Réessayer',
  'common.exercise': 'Exercice',
  'common.question': 'Question',
  'common.navigation': 'Navigation',
  'common.search': 'Rechercher',
  'common.show': 'Afficher',
  'common.showAll': 'Tout afficher',
  'common.hide': 'Masquer',
  'common.correction': 'Correction',
  'common.startCorrection': 'Résolvons l’exercice',
  'common.showCorrection': 'Résolvons l’exercice',
  'common.showMore': 'Voir la suite',
  'common.reduce': 'Réduire',
  'common.returnToHub': 'Retour au Hub',
  'common.correctAnswer': 'Bonne réponse',
  'common.yourChoice': 'Votre choix',
  'common.incorrectAnswer': 'réponse incorrecte',
  'common.true': 'Vrai',
  'common.false': 'Faux',
  'common.moveUpItem': 'Monter l’élément {index}',
  'common.moveDownItem': 'Descendre l’élément {index}',
  'common.orderCorrect': 'L’ordre est correct',
  'common.orderIncorrect': 'L’ordre est incorrect',
  'common.chooseErrorStep': 'Choisissez l’étape qui contient l’erreur',
  'revision.objectiveCompleted': 'Objectif terminé',
  'revision.sessionValidated': 'Séance {session} validée',
  'revision.finishSession': 'Terminer la séance {session}',
  'revision.allSessionsValidated': 'Toutes les séances sont validées',
  'revision.validationSaved': 'Validation enregistrée',
  'revision.clickToValidate': 'Cliquer pour valider',
  'quiz.retryMistakes': 'Travailler les erreurs ({count})',
  'quiz.retryMistakesShort': 'Travailler les erreurs',
  'quiz.reviewAll': 'Relire toutes les réponses',
  'quiz.startExercises': 'Passer aux exercices',
  'common.continue': 'Continuer',
  'common.quit': 'Quitter',
  'common.restart': 'Recommencer',
  'common.saveAndQuit': 'Sauvegarder et quitter',
  'common.abandon': 'Abandonner',
  'common.startExam': 'Lancer l’épreuve',
  'common.viewResults': 'Voir les résultats',
  'login.welcome': 'Bienvenue',
  'login.lycee': 'Lycée',
  'login.college': 'Collège',
  'login.student': 'Élève',
  'login.teacher': 'Enseignant',
  'login.teacherNote': "Pour activer les fonctionnalités professeur, contactez le +2126756789.",
  'login.firstName': 'Prénom',
  'login.firstNamePlaceholder': 'Ex: Youssef',
  'login.lastName': 'Nom de famille',
  'login.lastNamePlaceholder': 'Ex: El Amrani',
  'login.phone': 'Numéro de téléphone',
  'login.password': 'Mot de passe',
  'login.passwordPlaceholder': '6 caractères minimum',
  'login.classLabel': 'Ta classe',
  'login.classLabelTeacher': 'Niveau enseigné',
  'login.selectClass': 'Sélectionne ta classe…',
  'login.submit': 'Créer mon espace',
  'login.submitting': 'Création…',
  'login.alreadyRegistered': "J'ai déjà un compte",
  'login.reconnect': 'Bon retour.',
  'login.welcomeBack': "Reprends là où tu t'es arrêté.",
  'login.yourNumber': 'Votre numéro',
  'login.reconnectButton': 'Se connecter',
  'login.continueLearning': 'Reprendre',
  'login.changeAccount': 'Changer de compte',
  'nav.messages': 'Messages',
  'nav.orientation': 'Orientation & Conseils',
  'nav.orientationShort': 'Orientation',
  'nav.help': 'Aide',
  'nav.settings': 'Paramètres',
  'nav.settingsShort': 'Réglages',
  'nav.logout': 'Déconnexion',
  'nav.history': 'Historique',
};

const ar: Dictionary = {
  'common.appName': 'تعلم بذكاء',
  'common.tagline': 'التميّز بلا حدود',
  'common.back': 'رجوع',
  'common.cancel': 'إلغاء',
  'common.close': 'إغلاق',
  'common.loading': 'جارٍ التحميل…',
  'common.previous': 'السابق',
  'common.next': 'التالي',
  'common.skip': 'تخطي',
  'common.validate': 'تأكيد',
  'common.finish': 'إنهاء',
  'common.print': 'طباعة',
  'common.retry': 'إعادة المحاولة',
  'common.exercise': 'تمرين',
  'common.question': 'سؤال',
  'common.navigation': 'التنقل',
  'common.search': 'بحث',
  'common.show': 'إظهار',
  'common.showAll': 'عرض الكل',
  'common.hide': 'إخفاء',
  'common.startCorrection': 'لنحل التمرين',
  'common.correction': 'التصحيح',
  'common.showCorrection': 'لنحل التمرين',
  'common.showMore': 'عرض المزيد',
  'common.reduce': 'تقليص',
  'common.returnToHub': 'العودة إلى الصفحة الرئيسية',
  'common.correctAnswer': 'إجابة صحيحة',
  'common.yourChoice': 'اختيارك',
  'common.incorrectAnswer': 'إجابة غير صحيحة',
  'common.true': 'صحيح',
  'common.false': 'خطأ',
  'common.moveUpItem': 'نقل العنصر {index} إلى الأعلى',
  'common.moveDownItem': 'نقل العنصر {index} إلى الأسفل',
  'common.orderCorrect': 'الترتيب صحيح',
  'common.orderIncorrect': 'الترتيب غير صحيح',
  'common.chooseErrorStep': 'اختر المرحلة التي تحتوي على الخطأ',
  'revision.objectiveCompleted': 'تم إتمام الهدف',
  'revision.sessionValidated': 'تم تأكيد الحصة {session}',
  'revision.finishSession': 'إنهاء الحصة {session}',
  'revision.allSessionsValidated': 'تم تأكيد جميع الحصص',
  'revision.validationSaved': 'تم حفظ التأكيد',
  'revision.clickToValidate': 'انقر للتأكيد',
  'quiz.retryMistakes': 'مراجعة الأخطاء ({count})',
  'quiz.retryMistakesShort': 'مراجعة الأخطاء',
  'quiz.reviewAll': 'مراجعة جميع الإجابات',
  'quiz.startExercises': 'الانتقال إلى التمارين',
  'common.continue': 'متابعة',
  'common.quit': 'مغادرة',
  'common.restart': 'إعادة البدء',
  'common.saveAndQuit': 'حفظ والمغادرة',
  'common.abandon': 'تخلي',
  'common.startExam': 'بدء الاختبار',
  'common.viewResults': 'عرض النتائج',
  'login.welcome': 'مرحباً',
  'login.lycee': 'الثانوي التأهيلي',
  'login.college': 'الثانوي الإعدادي',
  'login.student': 'تلميذ',
  'login.teacher': 'أستاذ',
  'login.teacherNote': 'لتفعيل خدمات فضاء الأستاذ، يُرجى التواصل معنا على الرقم +2126756789.',
  'login.firstName': 'الاسم الشخصي',
  'login.firstNamePlaceholder': 'مثال: يوسف',
  'login.lastName': 'الاسم العائلي',
  'login.lastNamePlaceholder': 'مثال: العمراني',
  'login.phone': 'رقم الهاتف',
  'login.password': 'كلمة المرور',
  'login.passwordPlaceholder': '6 أحرف على الأقل',
  'login.classLabel': 'المستوى الدراسي',
  'login.classLabelTeacher': 'المستوى الدراسي الذي تُدرّسه',
  'login.selectClass': 'اختر مستواك الدراسي…',
  'login.submit': 'إنشاء حسابي',
  'login.submitting': 'جارٍ إنشاء الحساب…',
  'login.alreadyRegistered': 'لديّ حساب',
  'login.reconnect': 'مرحباً بعودتك.',
  'login.welcomeBack': 'تابع من حيث توقفت.',
  'login.yourNumber': 'رقم هاتفك',
  'login.reconnectButton': 'تسجيل الدخول',
  'login.continueLearning': 'متابعة التعلّم',
  'login.changeAccount': 'تغيير الحساب',
  'nav.messages': 'الرسائل',
  'nav.orientation': 'التوجيه المدرسي والمهني',
  'nav.orientationShort': 'التوجيه',
  'nav.help': 'المساعدة',
  'nav.settings': 'الإعدادات',
  'nav.settingsShort': 'إعدادات',
  'nav.logout': 'تسجيل الخروج',
  'nav.history': 'السجل',
};

export const translations: Record<Language, Dictionary> = { fr, ar };
