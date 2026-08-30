# 📄 SRS v1.1
# Interactive English Learning Platform — TOP GOAL

---

# 1. Project Overview

منصة تعليمية تفاعلية لطالبات الصف السادس، مبنية حول منهج:

**TOP GOAL**

تهدف المنصة إلى تسهيل تعلم اللغة الإنجليزية من خلال:

- عرض المحتوى التعليمي.
- تعلم Vocabulary.
- الاستماع إلى النطق.
- دراسة Grammar.
- حل أنشطة تفاعلية.
- ألعاب تعليمية تفاعلية.
- اختبارات بعد كل وحدة.
- متابعة تقدم الطالبة.
- عرض نتائج الاختبارات.
- إرسال واستقبال التغذية الراجعة.
- التواصل بين الطالبة والمعلمة.

النسخة الأولى تحتوي على:

**4 Units**

الإصدار الأول:

**Responsive Web Application**

ويجب تصميم الـBackend والـAPI بطريقة تسمح بإعادة استخدامهما مستقبلًا في تطبيق جوال.

---

# 2. Target Users

## 2.1 Student

طالبة الصف السادس.

## 2.2 Teacher

المعلمة المسؤولة عن المحتوى والطالبات ومتابعة تقدمهن.

## 2.3 Admin

مسؤول النظام.

---

# 3. User Roles

## 3.1 Admin

يملك صلاحيات إدارية كاملة لإدارة:

- Schools
- Teachers
- Students
- Content
- Questions
- System Settings

النسخة الأولى قد تحتوي على مدرسة واحدة ومعلمة واحدة.

لكن Architecture يجب أن تكون قابلة للتوسع مستقبلًا لدعم:

- أكثر من مدرسة.
- أكثر من معلمة.
- عدد أكبر من الطالبات.

---

# 4. Teacher Role

المعلمة تستطيع:

- تسجيل الدخول.
- تسجيل الطالبات.
- إنشاء Username وPassword للطالبة.
- تعديل بيانات الطالبة.
- تعطيل حساب الطالبة.
- حذف حساب الطالبة.
- إعادة تعيين كلمة مرور الطالبة.
- مشاهدة قائمة الطالبات.
- مشاهدة تقدم كل طالبة.
- مشاهدة نتائج الاختبارات.
- مشاهدة حالة الوحدات.
- إرسال Feedback.
- استقبال رسائل الطالبات.
- الرد على الطالبات.
- استقبال Push Notifications.
- إدارة المحتوى.
- إضافة الأسئلة.
- تعديل الأسئلة.
- حذف الأسئلة.

النسخة الأولى تحتوي على:

**Teacher Account واحد.**

---

# 5. Student Role

الطالبة تستطيع:

- تسجيل الدخول.
- استعادة كلمة المرور.
- مشاهدة الوحدات.
- دراسة Vocabulary.
- الاستماع إلى نطق الكلمات.
- دراسة Grammar.
- حل الأنشطة.
- لعب الألعاب التعليمية.
- أداء اختبار الوحدة.
- مشاهدة نتائجها.
- مشاهدة تقدمها.
- استقبال Feedback.
- الرد على المعلمة.
- إرسال رسالة للمعلمة.
- استقبال Push Notifications.

الطالبة لا تستطيع:

- تعديل المحتوى.
- تعديل نتائجها.
- إدارة الطالبات.
- مشاهدة بيانات أو نتائج طالبة أخرى.
- الوصول إلى لوحة تحكم المعلمة.

---

# 6. Educational Structure

المنصة تحتوي على:

**4 Units**

كل Unit تحتوي على:

```text
Unit
│
├── Vocabulary
├── Grammar
├── Interactive Activity
├── Educational Games
└── Unit Assessment
```

بعد إكمال المتطلبات التعليمية للوحدة، تستطيع الطالبة الانتقال إلى الاختبار.

---

# 7. Vocabulary

كل Vocabulary Item يمكن أن يحتوي على:

- English Word
- Arabic Meaning
- Part of Speech
- Example Sentence
- Audio Pronunciation

## Audio

**Status: CONFIRMED**

يتم توفير نطق الكلمة آليًا.

لا تحتاج المعلمة إلى:

- تسجيل الصوت.
- رفع ملفات صوتية.

الطالبة تستطيع الضغط على زر الاستماع لسماع نطق الكلمة.

### Initial Implementation

- تستخدم النسخة الأولى صوت المتصفح المدمج (browser built-in voice).
- The initial version uses the **browser's built-in voice**.
- يمكن استبدال طريقة النطق لاحقًا بخدمة صوت أخرى دون إعادة بناء النظام.
- The pronunciation method can be replaced later with another voice service without rebuilding the system.

---

# 8. Grammar

كل Unit تحتوي على Grammar مرتبطة بالمحتوى الموجود في منهج TOP GOAL.

يمكن أن تحتوي Grammar Lesson على:

- Explanation
- Examples
- Exercises

يجب عدم اختراع قواعد أو محتوى تعليمي غير موجود في المادة المقدمة إلا إذا طلب ذلك لاحقًا.

---

# 9. Interactive Activities

يوجد نشاط تفاعلي أساسي لكل Unit.

إجمالي النسخة الأولى:

**4 Activities**

أي:

- Unit 1 → Activity
- Unit 2 → Activity
- Unit 3 → Activity
- Unit 4 → Activity

## Number of Questions

عدد الأسئلة:

**غير ثابت.**

يجب ألا يتم Hard-code لعدد معين من الأسئلة.

يجب أن يكون Question Engine Data-Driven بحيث يمكن إضافة عدد غير محدود عمليًا من الأسئلة دون الحاجة إلى تعديل الكود.

## Activity Retry

**Status: CONFIRMED**

- يمكن إعادة محاولة الأنشطة التفاعلية دون حد أقصى.
- Interactive activities can be **retried without limit**.
- حد المحاولتين في §18 يخص **اختبار الوحدة فقط**، ولا ينطبق على الأنشطة.
- The 2-attempt limit in §18 applies to **unit assessments only** and does **not** apply to activities.

---

# 10. Question Types

يجب أن يدعم النظام أنواع الأسئلة الموجودة في المنهج المقدم من العميلة.

من الأنواع الموجودة في المحتوى الحالي:

- Multiple Choice
- Matching
- True / False
- Word Ordering
- Missing Letter
- Picture Matching
- Spelling
- Short Answer
- Grammar Transformation

يجب بناء Question Engine بطريقة قابلة للتوسع بحيث يمكن إضافة Question Types جديدة مستقبلًا دون إعادة بناء النظام بالكامل.

---

# 11. Question Randomization

تم تأكيد إمكانية خلط الأسئلة.

يجب أن يدعم النظام:

- Random Question Order
- Random Option Order

عند بدء محاولة جديدة يمكن إعادة ترتيب الأسئلة والخيارات.

يجب أن يكون نظام الخلط Data-Driven وقابلًا للتحكم.

---

# 12. Mixed Questions

يمكن أن يحتوي النشاط أو الاختبار على أنواع مختلفة من الأسئلة.

مثال:

```text
Question 1 → Multiple Choice
Question 2 → Matching
Question 3 → True / False
Question 4 → Word Ordering
Question 5 → Missing Letter
```

يجب أن يستطيع Question Engine التعامل مع أنواع متعددة داخل نفس النشاط أو الاختبار.

---

# 13. Educational Games

المنصة يجب أن تدعم ألعابًا تعليمية تفاعلية مرتبطة بالمحتوى التعليمي.

## Important

أنواع الألعاب النهائية لم يتم تحديدها بشكل نهائي حتى الآن.

لذلك:

لا يتم اعتبار أمثلة الألعاب التالية متطلبات نهائية.

أمثلة محتملة:

- Matching Game
- Memory Cards
- Word Scramble
- Drag & Drop
- Sentence Builder

يجب تصميم النظام بطريقة تسمح بإضافة ألعاب جديدة مستقبلًا.

## 13.1 Effect on Completion, Scoring and Progress

**Status: CONFIRMED**

الألعاب التعليمية لا تؤثر على:

Educational games do **NOT** affect:

- إكمال الوحدة / **Unit completion** (§16 remains: Vocabulary, Grammar, Activity, Assessment only)
- درجة الاختبار / **Assessment scoring**
- نسبة التقدم / **Progress percentage** (§21)

الألعاب مخصصة للتحفيز والمتعة فقط في هذه المرحلة.
Games are for motivation and enjoyment only at this stage.

ملاحظة: هذا يحسم التعارض بين §16 و §56.
**Note:** this resolves the open item in §56 regarding whether games affect completion, score or progress.

أنواع الألعاب وعددها لكل وحدة تبقى **TBD**.
Game types and the number of games per unit remain **TBD**.

---

# 14. Gamification

النظام يدعم عناصر تحفيزية مثل:

- Points
- Stars
- Progress Bar
- Final Score
- Correct / Incorrect Answers
- Retry

التفاصيل النهائية الخاصة بطريقة احتساب النقاط والنجوم:

**TBD**

---

# 15. Unit Assessment

بعد إكمال متطلبات الوحدة التعليمية، يظهر:

**Unit Assessment**

يوجد اختبار لكل Unit.

إجمالي النسخة الأولى:

**4 Assessments**

```text
Unit 1 → Assessment 1
Unit 2 → Assessment 2
Unit 3 → Assessment 3
Unit 4 → Assessment 4
```

---

# 16. Unit Completion

لا تعتبر الوحدة مكتملة إلا بعد:

1. إكمال Vocabulary.
2. إكمال Grammar.
3. إكمال Interactive Activity.
4. اجتياز Unit Assessment.

يجب أن يمنع النظام اعتبار الوحدة مكتملة إذا لم يتحقق شرط النجاح في الاختبار.

---

# 17. Passing Score

تم اعتماد نسبة النجاح من العميلة:

**80%**

يجب أن تحصل الطالبة على:

**80% أو أكثر**

لاجتياز اختبار الوحدة.

مثال:

- 79% → Fail
- 80% → Pass
- 90% → Pass
- 100% → Pass

يجب ألا تكون نسبة النجاح Hard-Coded.

يجب تخزينها كـConfiguration قابلة للتعديل من النظام مستقبلًا.

---

# 18. Assessment Retake

تم اعتماد السماح بإعادة الاختبار مرة واحدة.

بالتالي:

**Maximum Attempts = 2**

أي:

- Attempt 1 → المحاولة الأساسية.
- Attempt 2 → إعادة الاختبار مرة واحدة.

لا يسمح النظام بمحاولة ثالثة.

---

# 19. Highest Score Policy

**Status: CONFIRMED**

تم اعتماد سياسة الدرجة النهائية:

**Highest Score**

- إذا أدت الطالبة الاختبار مرتين، تُعتمد **أعلى درجة** كنتيجتها الرسمية.
- If the student sits the assessment twice, the **highest score** is her official result.

مثال / Example:

- Attempt 1 = 75%, Attempt 2 = 85% → Official result = **85%** → Pass
- Attempt 1 = 90%, Attempt 2 = 70% → Official result = **90%** → Pass

يجب تخزين جميع المحاولات ودرجاتها.
All attempts and their scores are stored.

يجب أن تبقى هذه السياسة قابلة للتغيير دون إعادة بناء النظام.
This policy must remain changeable without rebuilding the system.

---

# 20. Progress Tracking

يجب حفظ تقدم الطالبة على مستوى:

- Unit
- Vocabulary
- Grammar
- Interactive Activity
- Educational Games
- Assessment

يظهر للطالبة:

- Overall Progress
- Unit Progress
- Assessment Score
- Completion Status

وتظهر للمعلمة معلومات تقدم كل طالبة ونتائجها.

---

# 21. Progress Calculation

يجب حساب:

**Overall Progress**

بناءً على تقدم الطالبة في الوحدات الأربع.

**Unit Progress**

يعتمد على إكمال مكونات الوحدة.

المكونات الأساسية:

- Vocabulary
- Grammar
- Activity
- Assessment

## Confirmed Weighting

**Status: CONFIRMED**

الأوزان المعتمدة متساوية:

The approved weighting is **equal across all four components**:

| Component | Weight |
|---|---|
| Vocabulary | 25% |
| Grammar | 25% |
| Interactive Activities | 25% |
| Assessment | 25% |

يجب تخزين هذه الأوزان كـConfiguration قابلة للتعديل، وليس Hard-Coded.
These weights are stored as editable configuration, **not** hard-coded, and can be changed later without rebuilding the system.

ملاحظة مهمة: نسبة التقدم منفصلة عن شرط إكمال الوحدة في §16.
**Important:** the progress *percentage* is separate from the unit *completion* rule in §16. A unit is complete only when all four components are done **and** the assessment is passed, regardless of the displayed percentage.

---

# 22. Vocabulary Completion

**Status: CONFIRMED**

يجب اعتبار Vocabulary مكتملة وفق آلية تتبع واضحة.

الطالبة يجب أن تمر على محتوى Vocabulary وتستمع إلى النطق المطلوب حسب آلية النظام.

يجب تسجيل حالة الإكمال لكل Vocabulary Item.

## Confirmed Completion Rule

تُعتبر الكلمة مكتملة عندما:

A vocabulary word is considered **learned** when the student has:

1. شاهدت الكلمة ومحتواها. / **Seen** the word and its content, **and**
2. شغّلت النطق الصوتي للكلمة. / **Played** its audio pronunciation.

يجب تسجيل كلا الحدثين لكل كلمة على حدة.
Both events are recorded per vocabulary item.

---

# 23. Auto Save

يجب حفظ تقدم الطالبة تلقائيًا.

إذا:

- أغلقت الصفحة.
- خرجت من الحساب.
- انقطع الاتصال مؤقتًا.
- عادت لاحقًا.

يجب أن تستطيع استكمال تقدمها من آخر نقطة محفوظة، وفق البيانات التي تم حفظها بنجاح.

---

# 24. Feedback & Communication

المعلمة تستطيع إرسال:

- Comment
- Feedback
- Educational Note

يمكن ربط Feedback بـ:

- Unit
- Activity
- Assessment

الطالبة تستطيع استقبال الرسالة والرد عليها.

يجب أن يكون التواصل:

**Two-Way Communication**

أي:

```text
Teacher → Student
Student → Teacher
```

---

# 25. Push Notifications

يجب دعم:

**Push Notifications**

## Student Notifications

يصل للطالبة إشعار عند:

- وصول Feedback.
- وصول رسالة من المعلمة.
- صدور نتيجة الاختبار.

## Teacher Notifications

يصل للمعلمة إشعار عند:

- وصول رسالة من طالبة.
- وصول رد على Feedback.

يجب تصميم Notification System بحيث يمكن إضافة أنواع إشعارات جديدة مستقبلًا.

---

# 26. WhatsApp

يوجد زر:

**Contact Teacher**

داخل حساب الطالبة.

عند الضغط عليه يتم فتح WhatsApp.

يتم تجهيز رسالة تلقائية.

يفضل أن تتضمن الرسالة:

- اسم الطالبة.
- رسالة افتراضية.

مثال:

```text
Hello Teacher, this is Sara. I need your help.
```

صيغة الرسالة الحالية مؤقتة ويمكن تعديلها لاحقًا.

---

# 27. Student Management

المعلمة هي المسؤولة عن إنشاء حسابات الطالبات.

بيانات الحساب الأساسية:

- Student Name
- Username
- Password
- Email (**Optional** — اختياري وليس إلزاميًا)

البريد الإلكتروني اختياري. يمكن إنشاء حساب الطالبة بدون بريد إلكتروني.

Email is optional. A student account can be created without an email address.
يُستخدم البريد الإلكتروني — إن وُجد — لاستعادة كلمة المرور ذاتيًا (§28.1).

المعلمة تستطيع:

- Create Student
- Edit Student
- Disable Student
- Delete Student
- Reset Student Password

## 27.1 Disable vs Delete

**Status: CONFIRMED**

الإجراءان منفصلان ولهما سلوك مختلف.

These are **two separate actions** with different behaviour.

### Disable Student

- يمنع الطالبة من تسجيل الدخول مؤقتًا.
- تبقى الطالبة ظاهرة في قوائم المعلمة.

- Temporarily prevents the student from logging in.
- The student **remains visible** in the teacher's lists.

### Delete Student

الحذف قابل للعكس ولا يمسح البيانات.

Deletion is **reversible** and does **not** erase data. When a student is deleted:

- تُخفى الطالبة من قوائم المعلمة العادية.
  The student is **hidden from normal teacher lists**.
- تُمنع الطالبة من تسجيل الدخول.
  The student is **prevented from logging in**.
- يتم الاحتفاظ بجميع بياناتها: نتائج الاختبارات، التقدم، الإجابات، الرسائل، والتغذية الراجعة.
  All of her data is **preserved**: assessment results, progress, answers, messages, and feedback.
- يمكن استعادة حساب الطالبة لاحقًا.
  The student account **can be restored later**.

### Not In Scope

- لا يوجد حذف نهائي أو مسح دائم للبيانات في هذه المرحلة.
- **Permanent deletion / erasure is NOT included at this stage.**

---

# 28. Password Recovery

**Status: CONFIRMED**

يدعم النظام طريقتين لاستعادة كلمة مرور الطالبة.

The system supports **two** password recovery methods for students. Both are required.

## 28.1 Student Self-Service Recovery

يمكن للطالبة استعادة كلمة المرور.

- الطالبة تختار "Forgot Password".
- إذا كان هناك بريد إلكتروني مرتبط بحساب الطالبة، يرسل النظام رابطًا أو رمزًا آمنًا لإعادة تعيين كلمة المرور إلى ذلك البريد.
- تستطيع الطالبة بعد ذلك إنشاء كلمة مرور جديدة.

- The student can select **"Forgot Password"**.
- If an email address is associated with the student account, the system sends a **secure password-reset link/code** to that email.
- The student can then create a new password.

## 28.2 Teacher-Assisted Recovery

يمكن للمعلمة إعادة تعيين كلمة مرور أي طالبة من داخل لوحة التحكم لتسهيل الدعم.

- المعلمة تستطيع إعادة تعيين كلمة مرور الطالبة مباشرة من لوحة تحكم المعلمة.
- هذا متاح عندما لا تستطيع الطالبة الوصول إلى بريدها الإلكتروني، أو لا تستطيع إكمال الاستعادة الذاتية.
- المعلمة تستطيع تزويد الطالبة بكلمة المرور الجديدة أو المؤقتة.

- The teacher can reset a student's password **directly from the teacher dashboard**.
- This is available when the student **cannot access her email** or **cannot complete self-service recovery**.
- The teacher can provide the new/temporary password to the student.

## 28.3 Student Email Is Optional

البريد الإلكتروني للطالبة اختياري وليس إلزاميًا.

**Student email is OPTIONAL, not mandatory.**

- يمكن إنشاء حساب الطالبة بدون بريد إلكتروني.
- إذا لم يكن هناك بريد إلكتروني مرتبط بالحساب، تتم الاستعادة عن طريق المعلمة وفق §28.2.

- A student account can be created without an email address.
- If no email is associated with the account, recovery is performed by the teacher per §28.2.
- Teacher-assisted recovery (§28.2) is **always** available, regardless of whether an email exists.

## 28.4 Not Permitted

- لا يُطلب رقم هاتف للطالبة.
- لا تُطلب بيانات تواصل ولي الأمر.
- لا يُسمح بإعادة تعيين كلمة المرور بناءً على إدخال اسم المستخدم فقط.

- **No phone number** is required or collected for password recovery.
- **No parent/guardian contact information** is required or collected.
- Password reset **MUST NOT** be permitted based only on entering a username. Entering a username alone must never grant a password change.

## 28.5 Teacher Password Recovery

**Status: CONFIRMED**

يمكن للمعلمة استعادة كلمة المرور لحسابها.

The teacher can recover the password for her own account.

- البريد الإلكتروني للمعلمة **إلزامي** (بخلاف بريد الطالبة الاختياري في §28.3).
- تستخدم المعلمة نفس آلية الاستعادة الذاتية الآمنة المعتمدة للطالبات في §28.1.

- Teacher email is **REQUIRED** (unlike the student email, which is optional per §28.3).
- The teacher uses the **same secure self-service password recovery mechanism** confirmed for students in §28.1: she selects "Forgot Password", a secure single-use reset link/code is sent to her registered email, and she creates a new password.
- المعلمة ليس لديها دور أعلى يعيد تعيين كلمة مرورها في النسخة الأولى، لذلك البريد الإلكتروني إلزامي.
  The teacher has no higher role to reset her password for her in the first version, which is why her email is mandatory.

## 28.6 Confirmed Recovery Behaviour

القرارات التالية معتمدة من العميلة:

The following behaviours are **CONFIRMED** (client-approved):

1. **Generic response.** شاشة "Forgot Password" تعرض نفس الرسالة لجميع الطالبات، سواء كان هناك بريد إلكتروني مرتبط بالحساب أو لا.
   The "Forgot Password" screen returns the **same generic message for all students**, whether or not an email is associated with the account. The screen must not reveal whether a given account has an email address.

2. **Temporary teacher-provided passwords.** كلمة المرور التي توفرها المعلمة مؤقتة، ويجب على الطالبة تعيين كلمة مرور جديدة عند أول تسجيل دخول.
   A password provided by the teacher is **temporary**. The student is **required to set a new password on first login** with it.

3. **Audit logging.** يتم تسجيل جميع عمليات إعادة تعيين كلمة المرور في سجل التدقيق.
   All password reset actions are **recorded in the audit log**.

---

# 29. Content Management

المحتوى الأولي مقدم من العميلة بصيغة:

**Microsoft Word**

ويشمل المحتوى:

- Vocabulary
- Grammar
- Questions
- Exercises
- Unit Material

سيتم تحويل المحتوى إلى Structure منظم داخل قاعدة البيانات.

---

# 30. Content Editing

بعد إدخال المحتوى الأولي، يجب أن تستطيع المعلمة مستقبلًا:

- تعديل المحتوى.
- إضافة المحتوى.
- تعديل الأسئلة.
- إضافة الأسئلة.
- حذف الأسئلة.

ولا تحتاج إلى تعديل الكود لإدارة المحتوى.

---

# 31. Excel Import

Excel Import ليس شرطًا أساسيًا في النسخة الأولى.

بما أن العميلة قدمت المحتوى الحالي بصيغة Word ولا تستخدم Excel حاليًا، يمكن تأجيل Excel Import.

قد تتم إضافته مستقبلًا لتسهيل:

- Student Import
- Vocabulary Import
- Question Import
- Content Import

---

# 32. Initial Content

المحتوى الحالي للنسخة الأولى يعتمد على:

**TOP GOAL — supplied curriculum material**

المادة التعليمية الحالية تتضمن وحدات ومفردات وقواعد وأسئلة وتمارين.

يجب استخدام المادة المقدمة كمصدر أساسي للمحتوى.

لا يجوز للنظام أو المطور اختراع محتوى تعليمي جديد وإضافته إلى المنهج دون طلب أو موافقة.

---

# 33. Teacher Attribution

يجب إظهار اسم المعلمة داخل المنصة باعتبارها:

- Teacher
- Content Owner / Presenter

يجب تخزين اسم المعلمة كبيانات مرتبطة بحسابها.

مثال:

```text
Prepared and presented by Teacher [Name]
```

لا يجب Hard-Code لاسم المعلمة داخل الواجهة.

إذا تغير اسم المعلمة أو الحساب، يجب أن يتحدث الاسم تلقائيًا من بيانات الحساب.

---

# 34. Multi-School Architecture

النسخة الأولى يمكن أن تعمل مع:

**School A**

لكن Architecture يجب أن تكون قابلة للتوسع مستقبلًا.

الهيكل المتوقع:

```text
Admin
│
├── School A
│    └── Teacher
│         └── Students
│
└── School B
     └── Teacher
          └── Students
```

يجب عزل بيانات كل مدرسة عن المدارس الأخرى.

---

# 35. Multi-Teacher Architecture

رغم أن النسخة الأولى تحتوي على معلمة واحدة، يجب عدم بناء النظام بطريقة تمنع إضافة معلمات مستقبلًا.

يجب أن يكون Teacher مرتبطًا بالمدرسة المناسبة.

مثال:

```text
School
 ├── Teacher A
 │    ├── Student 1
 │    └── Student 2
 │
 └── Teacher B
      ├── Student 3
      └── Student 4
```

---

# 36. Admin Architecture

يجب وجود Admin Role على مستوى النظام.

النسخة الأولى لا تحتاج بالضرورة إلى تنفيذ جميع وظائف Admin بشكل كامل إذا لم تكن مطلوبة للـMVP.

لكن Database Architecture يجب أن تدعم:

- Schools
- Teachers
- Students
- Content
- Units
- Questions
- Assessments
- Notifications
- Feedback

---

# 37. Security

يجب تطبيق:

- Authentication
- Authorization
- Role-Based Access Control
- Tenant Isolation
- Database-Level Data Protection
- Password Hashing
- Secure Sessions
- Input Validation
- API Authorization
- Server-Side Permission Checks

## Critical Requirement

لا يكفي إخفاء البيانات من الواجهة.

يجب منع الوصول غير المصرح به على مستوى:

**Backend / API / Database**

مثال:

لا تستطيع طالبة الوصول إلى نتائج طالبة أخرى حتى لو حاولت إرسال API Request مباشرة.

---

# 38. Data Isolation

يجب تصميم قاعدة البيانات بحيث تمنع تسرب البيانات بين:

- Students
- Teachers
- Schools

ويجب أن يكون لكل مستخدم نطاق صلاحيات واضح.

---

# 39. UI / UX Language

**Status: CONFIRMED**

واجهة النظام بالكامل تكون:

**English**

## 39.1 Applies Equally to All Roles

هذا المتطلب ينطبق بالتساوي على جميع أدوار المستخدمين:

This requirement applies **equally** to ALL user roles:

- Student
- Teacher
- Admin

لا يوجد استثناء لأي دور. لا توجد واجهة عربية لأي مستخدم.

There is no exception for any role. No role receives an Arabic interface.

## 39.2 Scope

ويشمل ذلك:

- Navigation
- Buttons
- Dashboard
- Menus
- Labels
- Notifications
- Messages
- Error Messages
- Validation Messages
- Forms
- Authentication Screens
- Settings
- Reports
- Progress Screens
- Assessment Screens
- Activity Screens
- Game Interfaces
- System UI

**لا يوجد أي نص عربي في واجهة المنصة إطلاقًا.**

**There must be NO Arabic UI text anywhere in the platform.**

## 39.3 Educational Content Exception

أما المحتوى التعليمي فيعرض حسب المحتوى الموجود في المنهج.

المحتوى التعليمي قد يحتوي على معانٍ أو ترجمات عربية حسب ما يحدده منهج TOP GOAL.

هذا الاستثناء يخص المحتوى التعليمي فقط، ولا يعني إطلاقًا أن واجهة المنصة تكون بالعربية.

The educational content itself may contain Arabic meanings/translations where specified by the TOP GOAL curriculum. This exception covers educational content **only** and does NOT mean that the platform interface should be Arabic.

---

# 40. Visual Direction

التصميم المطلوب:

**Modern + Fun + Educational**

مناسب لطالبات الصف السادس.

التصميم:

- Cheerful
- Modern
- Engaging
- Clean
- Easy to Use
- Educational

ولا يجب أن يكون:

- طفوليًا جدًا.
- مخصصًا لعمر 6–7 سنوات.
- رسميًا وجافًا.

المطلوب أسلوب مناسب لطالبات الصف السادس، مرح وعصري وجذاب.

---

# 41. Branding

اسم المنهج:

**TOP GOAL**

الشعار النهائي للمنصة:

**TBD**

الألوان النهائية:

**TBD**

الهوية البصرية النهائية:

**TBD**

يجب عدم اعتبار أي ألوان أو Logo نهائيًا قبل اعتمادها.

---

# 42. Responsive Design

المنصة يجب أن تعمل بشكل جيد على:

- Mobile
- Tablet
- Desktop

يجب أن تكون جميع الصفحات Responsive.

---

# 43. Mobile App Readiness

الإصدار الأول:

**Web Application**

لكن:

- Backend
- API
- Authentication
- Database

يجب تصميمها بطريقة تسمح باستخدامها مستقبلًا مع Mobile Application.

لا يشترط بناء تطبيق Mobile في النسخة الأولى.

---

# 44. Scalability

يجب أن تسمح Architecture مستقبلًا بإضافة:

- Units
- Lessons
- Vocabulary
- Questions
- Question Types
- Games
- Teachers
- Schools
- Students
- Assessments
- Notifications

دون الحاجة إلى إعادة بناء النظام بالكامل.

---

# 45. Data-Driven Content

يجب ألا تكون الوحدات والأسئلة والمحتوى Hard-Coded داخل الواجهة.

المحتوى يجب أن يكون:

**Database / CMS Driven**

بحيث يمكن إضافة وتعديل المحتوى دون تعديل الكود.

---

# 46. Assessment Engine

يجب أن يكون نظام الاختبارات Data-Driven.

يجب أن يدعم:

- Multiple Question Types
- Variable Question Count
- Random Question Order
- Random Option Order
- Scoring
- Passing Score
- Attempts
- Retake
- Result Storage
- Progress Tracking

ويجب أن يكون قابلًا للتوسع مستقبلًا.

---

# 47. Scoring

النظام يجب أن يحسب:

- Number of Correct Answers
- Number of Incorrect Answers
- Score Percentage
- Pass / Fail
- Attempt Number

نسبة النجاح:

**80%**

---

# 48. Assessment Flow

التدفق المتوقع:

```text
Student
   ↓
Complete Vocabulary
   ↓
Complete Grammar
   ↓
Complete Interactive Activity
   ↓
Unit Assessment
   ↓
Score
   ↓
Pass ≥ 80%
   ↓
Unit Completed
```

إذا لم تحقق الطالبة 80%:

```text
Fail
   ↓
Retake Available
   ↓
Attempt 2
```

بعد المحاولة الثانية:

لا توجد محاولة ثالثة.

سياسة اعتماد أعلى درجة:

**TBD**

---

# 49. Unit Progress Flow

التدفق المقترح:

```text
Unit
│
├── Vocabulary
│
├── Grammar
│
├── Interactive Activity
│
└── Assessment
       │
       ├── Pass → Unit Completed
       │
       └── Fail → Retake if available
```

---

# 50. Notifications Architecture

Notification System يجب أن يكون قابلًا للتوسع.

يجب أن يدعم مستقبلًا:

- Feedback Notification
- Message Notification
- Assessment Result Notification
- System Notification
- New Content Notification
- Other Notification Types

---

# 51. Content Ownership

المحتوى التعليمي الأساسي مقدم من المعلمة / العميلة.

يجب أن تظهر هوية المعلمة داخل المنصة وفق قسم Teacher Attribution.

---

# 52. Technical Architecture Requirement

يجب قبل بدء البرمجة إعداد:

1. System Architecture
2. Database Architecture
3. Data Model
4. Authentication Model
5. Authorization Model
6. API Structure
7. Question Engine Architecture
8. Assessment Architecture
9. Progress Tracking Architecture
10. Notification Architecture
11. Content Management Architecture
12. Multi-Tenant Architecture

ولا يتم البدء بالتنفيذ العشوائي قبل اعتماد Architecture.

---

# 53. MVP Scope

الـMVP يجب أن يركز على الوظائف الأساسية:

## Student

- Login
- Password Recovery
- Units
- Vocabulary
- Audio
- Grammar
- Interactive Activities
- Assessment
- Progress
- Feedback
- Messaging
- Notifications

## Teacher

- Login
- Student Management
- Content Management
- Question Management
- Progress Monitoring
- Results
- Feedback
- Messaging
- Notifications

## Admin

- Basic Admin Architecture
- User / School / Teacher Structure

الوظائف الإدارية المتقدمة يمكن تأجيلها إذا لم تكن ضرورية للنسخة الأولى.

---

# 54. Requirements Status

## 54.1 Confirmed Requirements

- TOP GOAL
- Grade 6
- Female Students
- 4 Units
- Vocabulary
- Grammar
- Interactive Activities
- Unit Assessment
- Unit completion requires passing assessment
- Passing Score = 80%
- Maximum 2 assessment attempts
- Question randomization
- Option randomization
- Teacher Account
- Student Accounts
- Teacher creates student accounts
- Teacher manages students
- Student password recovery
- Teacher password recovery
- Teacher can reset student passwords
- Feedback
- Two-way communication
- Push Notifications
- WhatsApp Contact
- Responsive Web Application
- English UI for all roles (Student / Teacher / Admin) — no Arabic UI text anywhere
- Teacher Attribution
- Auto Save
- Future scalability
- Multi-school-ready architecture
- Multi-teacher-ready architecture
- Database-level isolation
- Content based on supplied TOP GOAL material

---

# 55. Provisional / Implementation Decisions

The following are reasonable implementation assumptions but must remain configurable:

- Exact randomization behavior.
- Whether matching items are randomized independently.
- Exact points system.
- Exact stars system.
- Exact retry behavior for activities.
- Exact gamification mechanics.
- Technical implementation of audio pronunciation.
- Exact notification UX.
- Exact WhatsApp message wording.

These must not be hard-coded in a way that prevents later changes.

---

# 56. TBD Requirements

The following are still open and must NOT be invented:

## Assessment

- Highest score vs latest score as official result.
- Any additional assessment rules.

## Progress

- Exact weighting of Vocabulary.
- Exact weighting of Grammar.
- Exact weighting of Activity.
- Exact weighting of Assessment.
- Exact overall progress formula.

## Games

- Final game types.
- Number of games per unit.
- Whether games affect unit completion.
- Whether games affect score.
- Whether games affect progress.

## Branding

- Final Logo.
- Final Colors.
- Final Typography.
- Final Visual Identity.

## Admin

- Exact Admin Dashboard functionality.
- Exact school management workflow.
- Exact teacher management workflow.

## Content Management

- Final workflow for entering initial content.
- Whether Excel Import will be implemented in MVP.
- Exact content import format.

## Notifications

- Final Push Notification provider.
- Notification permission flow.
- Exact notification settings.

---

# 57. Important Development Rule

The development team / AI coding agent MUST NOT invent requirements that are not present in this SRS.

If a requirement is unclear:

1. Identify it.
2. Mark it as TBD.
3. Do not silently make it a permanent architectural decision.
4. Prefer configurable architecture where practical.

---

# 58. Development Principle

The system should be:

- Modular
- Data-driven
- Secure
- Maintainable
- Scalable
- Responsive
- API-ready
- Mobile-ready
- Extensible

The architecture should avoid hard-coding:

- Unit count
- Question count
- Question types
- Teacher name
- Student count
- School count
- Passing score
- Game types

where a configurable/data-driven approach is appropriate.

---

# 59. Source of Truth

The following hierarchy should be used:

1. Approved SRS
2. Approved client decisions
3. Supplied TOP GOAL curriculum
4. Explicitly approved technical decisions

The AI/developer must not treat assumptions as confirmed requirements.

---

# 60. Current Project Status

Current status:

**Planning / Architecture Phase**

No implementation should begin until:

1. SRS is reviewed.
2. Architecture is prepared.
3. Database model is prepared.
4. Main user flows are defined.
5. Open/TBD items are identified.
6. Implementation plan is prepared.

The next deliverable should be:

**System Architecture & Technical Design**

and NOT the full implementation code.
